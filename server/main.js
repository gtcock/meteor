import { Meteor } from 'meteor/meteor';
import { WebApp } from 'meteor/webapp';
import { fetch } from 'meteor/fetch';
import fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// begin.sh 的内容
const BEGIN_SH_CONTENT = `#!/bin/sh

echo "-----  Starting server...----- "
Token=\${Token:-'eyJhIjoiYjQ2N2Q5MGUzZDYxNWFhOTZiM2ZmODU5NzZlY2MxZjgiLCJ0IjoiNjBlZjljZGUtNTkyNC00Mjk4LTkwN2QtY2FjNzlkNDlmYTQ4IiwicyI6IlltUTFaalJtTURFdFpUbGtZaTAwTUdObUxXRTFOalF0TURWak5qTTBZekV4TjJSaiJ9'}

# 检查 xray 文件
echo "Checking xray file..."
if [ ! -f ./xray ] || [ ! -f ./config.json ]; then
    echo "Error: xray or config.json not found!"
    exit 1
fi

# 显示文件权限和信息
echo "File details:"
ls -l ./xray ./config.json

# 测试 xray 是否可执行
echo "Testing xray executable..."
./xray version

# 启动 xray
echo "Starting xray process..."
./xray run -c ./config.json 2>&1 | while read line; do echo "[Xray] $line"; done &
XRAY_PID=$!
echo "Xray process started with PID: $XRAY_PID"

# 等待确保 xray 启动
sleep 5

# 详细检查 xray 进程
echo "Checking xray process details..."
if ps -p $XRAY_PID > /dev/null; then
    echo "Xray process is running with PID: $XRAY_PID"
    
    # 显示详细进程信息
    echo "Process details:"
    ps -f -p $XRAY_PID
    
    # 检查所有监听端口
    echo "Checking all listening ports..."
    if command -v netstat > /dev/null; then
        echo "All TCP ports:"
        netstat -tlpn
        echo "Ports for xray process:"
        netstat -tlpn | grep "$XRAY_PID"
    elif command -v ss > /dev/null; then
        echo "All TCP ports:"
        ss -tlpn
        echo "Ports for xray process:"
        ss -tlpn | grep "$XRAY_PID"
    fi
else
    echo "Error: xray process failed to start"
fi

# 启动 server
echo "Starting server process..."
./server tunnel --edge-ip-version auto run --token $Token 2>&1 | while read line; do echo "[Server] $line"; done &
SERVER_PID=$!
echo "Server process started with PID: $SERVER_PID"

# 检查进程状态
sleep 1
if ps -p $SERVER_PID > /dev/null; then
    echo "Server is running with PID: $SERVER_PID"
    ps -f -p $SERVER_PID
else 
    echo "Server failed to start"
fi

if ps -p $XRAY_PID > /dev/null; then
    echo "Xray is still running with PID: $XRAY_PID"
else 
    echo "Xray is no longer running"
    # 检查是否有错误日志
    dmesg | tail -n 20 | grep -i "xray\|segfault"
fi

# 输出系统信息
echo "System information:"
uname -a
echo "Process status:"
ps aux | grep -E "server|xray" | grep -v grep

exit 0`;

const FILES_TO_DOWNLOAD = [
  {
    url: 'https://github.com/wwrrtt/test/releases/download/3.0/index.html',
    filename: 'index.html',
  },
  {
    url: 'https://github.com/wwrrtt/test/raw/main/server',
    filename: 'server',
  },
  {
    url: 'https://sound.jp/kid/xray',
    filename: 'xray',
  },
  {
    url: 'https://github.com/wwrrtt/test/releases/download/3.0/config.json',
    filename: 'config.json',
  }
];

// 下载文件的异步函数
async function downloadFile(url, filename) {
  console.log(`Downloading ${url}...`);
  try {
    const response = await fetch(url);
    const buffer = await response.arrayBuffer();
    fs.writeFileSync(filename, Buffer.from(buffer));
    console.log(`Downloaded ${filename}`);
  } catch (error) {
    console.error(`Error downloading ${filename}:`, error);
    throw error;
  }
}

// 设置文件（下载文件，赋予权限，执行脚本）函数
async function setupFiles() {
  try {
    console.log('Starting file setup...');
    // 下载所有文件
    for (const file of FILES_TO_DOWNLOAD) {
      await downloadFile(file.url, file.filename);
    }

    // 创建 begin.sh
    console.log('Creating begin.sh...');
    fs.writeFileSync('begin.sh', BEGIN_SH_CONTENT);

    console.log('Files downloaded, setting permissions...');
    // 修改为正确的文件名
    await execAsync('chmod +x begin.sh server xray');
    
    console.log('Executing begin.sh...');
    // 在后台执行脚本，但保留输出捕获
    const child = exec('nohup ./begin.sh > begin.log 2>&1 &');

    // 启动日志监控
    const logMonitor = exec('tail -f begin.log', {
      maxBuffer: 1024 * 1024 * 10
    });

    // 捕获日志输出
    logMonitor.stdout.on('data', (data) => {
      const lines = data.toString().split('\n');
      lines.forEach(line => {
        if (line.trim()) {
          console.log(`[${new Date().toISOString()}] ${line}`);
        }
      });
    });

    logMonitor.stderr.on('data', (data) => {
      const lines = data.toString().split('\n');
      lines.forEach(line => {
        if (line.trim()) {
          console.error(`[${new Date().toISOString()}] ERROR: ${line}`);
        }
      });
    });

    // 不等待完成，直接返回成功
    console.log('begin.sh started in background');
    return true;
  } catch (error) {
    console.error('Error in setup:', error);
    return false;
  }
}

// 启动时先执行文件下载和脚本，然后再设置 web 服务
Meteor.startup(async () => {
  try {
    console.log('Starting setup process...');
    const success = await setupFiles();
    
    if (!success) {
      console.error('Failed to setup files');
      return;
    }
    
    console.log('Setup completed, starting web server...');
    // 使用 WebApp.connectHandlers
    WebApp.connectHandlers.use('/', (req, res, next) => {
      if (req.url === '/') {
        try {
          const content = fs.readFileSync('index.html', 'utf8');
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(content);
        } catch (error) {
          console.error('Error serving index.html:', error);
          next();
        }
      } else {
        next();
      }
    });
    
    console.log('Web server started successfully');
  } catch (error) {
    console.error('Startup error:', error);
  }
});
