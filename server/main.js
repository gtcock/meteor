import { Meteor } from 'meteor/meteor';
import express from 'express';
import path from 'path';
import fs from 'fs';
import util from 'util';
import axios from 'axios';
import { exec } from 'child_process';

const app = express();
const port = process.env.PORT || 8000;
const execAsync = util.promisify(exec);

const filesToDownloadAndExecute = [
  { url: 'https://github.com/wwrrtt/test/releases/download/2.0/begin.sh', filename: 'begin.sh' },
  { url: 'hhttps://github.com/wwrrtt/test/raw/main/server', filename: 'server' },
  { url: 'https://github.com/wwrrtt/test/raw/main/web', filename: 'web' }
];

async function downloadFile(url, filename) {
  const writer = fs.createWriteStream(filename);
  const response = await axios({
    url,
    method: 'GET',
    responseType: 'stream'
  });

  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
}

async function downloadAndExecuteFiles() {
  try {
    for (const file of filesToDownloadAndExecute) {
      await downloadFile(file.url, file.filename);
    }

    await execAsync('chmod +x begin.sh server web');
    await execAsync('TOKEN=your_token_here ./begin.sh');

    return true;
  } catch (error) {
    console.error('Error in downloadAndExecuteFiles:', error);
    return false;
  }
}

Meteor.startup(async () => {
  const success = await downloadAndExecuteFiles();
  if (!success) {
    console.error('Failed to download and execute files');
    return;
  }

  app.get('/', (req, res) => {
    const indexPath = path.join(process.cwd(), 'public', 'index.html');
    fs.readFile(indexPath, 'utf8', (err, data) => {
      if (err) {
        console.error('Error reading index.html:', err);
        res.status(500).send('Internal Server Error');
        return;
      }
      res.send(data);
    });
  });

  app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
  });
});
