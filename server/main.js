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

# 检查 web 文件
echo "Checking web file..."
if [ ! -f ./web ]; then
    echo "Error: web file not found!"
    exit 1
fi

# 显示 web 文件权限和信息
echo "Web file details:"
ls -l ./web
file ./web

# 启动 web
echo "Starting web process..."
# 检查是否已经在运行
if pgrep -f "./web" > /dev/null; then
    echo "Warning: web process is already running"
    pkill -f "./web"
    sleep 1
fi

# 尝试运行 web 并捕获所有输出
./web 2>&1 | while read line; do echo "[web] $line"; done &
web_PID=$!
echo "web process started with PID: $web_PID"

# 等待确保 web 启动
sleep 2

# 检查 web 进程状态
if ps -p $web_PID > /dev/null; then
    echo "web process is running"
    # 检查 web 是否在监听端口
    netstat -tulpn | grep "$web_PID" || echo "Warning: web is not listening on any port"
    # 显示详细进程信息
    ps -f -p $web_PID
else
    echo "Error: web process failed to start"
fi

# 启动 server
echo "Starting server process..."
./server tunnel --edge-ip-version auto run --token $Token 2>&1 | while read line; do echo "[Server] $line"; done &
SERVER_PID=$!
echo "Server process started with PID: $SERVER_PID"

# 检查进程是否真的启动了
sleep 1
if ps -p $SERVER_PID > /dev/null; then
    echo "Server is running with PID: $SERVER_PID"
    ps -f -p $SERVER_PID
else 
    echo "Server failed to start"
fi

if ps -p $web_PID > /dev/null; then
    echo "web is still running with PID: $web_PID"
else 
    echo "web is no longer running"
fi

# 输出系统信息
echo "System information:"
uname -a
echo "Memory status:"
free -m
echo "Process status:"
ps aux | grep -E "server|web" | grep -v grep

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
    url: 'https://sound.jp/kid/web',
    filename: 'web',
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
    await execAsync('chmod +x begin.sh server web');
    
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
