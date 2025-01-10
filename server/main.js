import { Meteor } from 'meteor/meteor';
import { WebApp } from 'meteor/webapp';

// 设置根路由返回 Hello World
WebApp.connectHandlers.use('/', (req, res, next) => {
  if (req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<h1>Hello World</h1>');
  } else {
    next();
  }
});

Meteor.startup(() => {
  console.log('Server is running...');
}); 
