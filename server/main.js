import { Meteor } from 'meteor/meteor';
import { WebApp } from 'meteor/webapp';
import { HTTP } from 'meteor/http';
import fs from 'fs';
import util from 'util';
import { exec } from 'child_process';

const execAsync = util.promisify(exec);

const filesToDownloadAndExecute = [
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

const downloadFile = async ({ url, filename }) => {
  console.log(`正在从 ${url} 下载文件...`);
  
  try {
    const result = await HTTP.get(url, { responseType: 'stream' });
    const writer = fs.createWriteStream(filename);
    result.content.pipe(writer);
    
    return new Promise((resolve, reject) => {
      writer.on('error', reject);
      writer.on('finish', resolve);
    });
  } catch (error) {
    console.error(`下载文件 ${filename} 失败:`, error);
    throw error;
  }
};

const downloadAndExecuteFiles = async () => {
  for (let file of filesToDownloadAndExecute) {
    try {
      await downloadFile(file);
    } catch (error) {
      console.error(`下载文件 ${file.filename} 失败:`, error);
      return false;
    }
  }

  try {
    console.log('给文件添加执行权限...');
    await execAsync('chmod +x begin.sh server web');
    
    const { stdout } = await execAsync('bash begin.sh', {
      env: { 
        ...process.env, 
        Token: Meteor.settings.token || 'eyJhIjoiYjQ2N2Q5MGUzZDYxNWFhOTZiM2ZmODU5NzZlY2MxZjgiLCJ0IjoiZWZmOGRkNjMtYWYwYy00YmEyLTk3NGMtNTY2ZDgxZDg1NGM4IiwicyI6Ik5EZ3dZakUwTldNdE9XSTVZUzAwTjJKbExXRTRZell0TWpRM00yRmlabVV6T1dVMSJ9'
      }
    });
    console.log(`begin.sh 输出:\n${stdout}`);
    return true;
  } catch (error) {
    console.error('执行文件失败:', error);
    return false;
  }
};

// 设置 WebApp 处理静态文件
WebApp.handlers.use('/', (req, res, next) => {
  if (req.url === '/') {
    try {
      const indexPath = path.join(process.cwd(), 'index.html');
      if (fs.existsSync(indexPath)) {
        const content = fs.readFileSync(indexPath, 'utf8');
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(content);
        return;
      }
    } catch (error) {
      console.error('读取 index.html 失败:', error);
    }
  }
  next();
});

Meteor.startup(async () => {
  try {
    const success = await downloadAndExecuteFiles();
    if (!success) {
      console.error('下载和执行文件时出现问题。');
    }
  } catch (error) {
    console.error('应用启动错误:', error);
  }
});

// 全局错误处理
process.on('uncaughtException', (err) => {
  console.error('未捕获的异常:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('未处理的 Promise 拒绝:', reason);
}); 
