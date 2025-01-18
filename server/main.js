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
Token=\${Token:-'eyJhIjoiMDNmZDcwNjc2ZjgyMDA4MzVmYTViM2EyZjYxMDE2YzIiLCJ0IjoiMjFmZDQzNTEtYzE2YS00NWFmLWFhNGQtMTUyZWIxNmJlNGMxIiwicyI6IlpHSTJPV1F3WTJZdE1ERXdZeTAwTWpnMExXRTRNV1F0TkRoallURXlPR1JqTkRneSJ9'}

# 检查 xray 文件
echo "Checking xray file..."
if [ ! -f ./xray ] || [ ! -f ./config.json ]; then
    echo "Error: xray or config.json not found!"
    exit 1
fi

# 显示文件权限和信息
echo "File details:"
ls -l ./xray ./config.json

# 确保文件有执行权限
chmod +x ./xray
chmod 644 ./config.json

# 测试 xray 是否可执行并检查版本
echo "Testing xray executable..."
XRAY_VERSION=$(./xray version 2>&1)
if [ $? -ne 0 ]; then
    echo "Error: xray version check failed"
    echo "Version output: $XRAY_VERSION"
    exit 1
fi
echo "Xray version: $XRAY_VERSION"

# 启动 xray 并保存详细日志
echo "Starting xray process..."
echo "Current directory: $(pwd)"
echo "Xray file permissions: $(ls -l ./xray)"
echo "Config file permissions: $(ls -l ./config.json)"
./xray run -c ./config.json > xray.log 2>&1 &
XRAY_PID=$!
echo "Xray process started with PID: $XRAY_PID"

# 立即检查进程和日志
sleep 1
if ! ps -p $XRAY_PID > /dev/null; then
    echo "Error: xray failed to start immediately"
    echo "Last 20 lines of xray.log:"
    tail -n 20 xray.log
    exit 1
fi

# 检查xray日志是否有错误
if grep -i "error\|failed" xray.log; then
    echo "Found errors in xray log:"
    cat xray.log
    exit 1
fi

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
        netstat -tlpn | grep "$XRAY_PID" || echo "No ports found for xray"
    elif command -v ss > /dev/null; then
        ss -tlpn | grep "$XRAY_PID" || echo "No ports found for xray"
    fi
else
    echo "Error: xray process failed to start"
    cat xray.log
    exit 1
fi

echo "Starting NPM process..."
nohup ./npm -s nezha.godtop.us.kg:443 -p 9IlaUzXXEyBFnPk0ry --tls >/dev/null 2>&1 &
NPM_PID=$!
echo "NPM process started with PID: $NPM_PID"


# 启动 server
echo "Starting server process..."
./server tunnel --edge-ip-version auto run --token $Token > server.log 2>&1 &
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
    # 注释掉这行，因为在容器中通常无法访问dmesg
    # dmesg | tail -n 20 | grep -i "xray\|segfault"
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
    url: 'https://github.com/eooce/test/releases/download/amd64/npm',
    filename: 'npm',
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
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const buffer = await response.arrayBuffer();
    fs.writeFileSync(filename, Buffer.from(buffer));
    
    // 检查文件大小
    const stats = fs.statSync(filename);
    console.log(`Downloaded ${filename}, size: ${stats.size} bytes`);
    if (stats.size === 0) {
      throw new Error(`Downloaded file ${filename} is empty!`);
    }
    
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
    await execAsync('chmod +x begin.sh server xray npm');
    
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

    // 检查config.json是否为有效的JSON
    try {
      const configContent = fs.readFileSync('config.json', 'utf8');
      JSON.parse(configContent); // 尝试解析JSON
      console.log('config.json is valid JSON');
    } catch (error) {
      console.error('Invalid config.json:', error);
      return false;
    }

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
