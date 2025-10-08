// server.js (simplified)
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs').promises;
const path = require('path');
const simpleGit = require('simple-git');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const git = simpleGit();
const FILE = path.join(__dirname, 'issues.json');

let issues = [];
let nextId = 1;

// Load issues from file or create new
async function loadIssues() {
  try {
    const data = await fs.readFile(FILE, 'utf8');
    issues = JSON.parse(data);
    nextId = issues.length ? Math.max(...issues.map(i => i.id)) + 1 : 1;
  } catch {
    issues = [];
    await save('Initialized issues.json');
  }
}

// Save and commit to Git
async function save(msg) {
  await fs.writeFile(FILE, JSON.stringify(issues, null, 2));
  try {
    await git.add(FILE);
    await git.commit(msg);
  } catch (e) {
    console.log('Git commit failed:', e.message);
  }
  io.emit('issues', issues);
}

// Serve frontend
app.use(express.static('public'));

// WebSocket events
io.on('connection', socket => {
  socket.emit('issues', issues);

  socket.on('createIssue', async d => {
    const issue = {
      id: nextId++,
      title: d.title || 'Untitled',
      description: d.description || '',
      status: 'Open',
      createdBy: d.createdBy || 'Anonymous',
      comments: [],
      createdAt: new Date().toISOString()
    };
    issues.push(issue);
    await save(`Issue #${issue.id} created by ${issue.createdBy}`);
  });

  socket.on('updateIssue', async d => {
    const i = issues.find(x => x.id === d.id);
    if (!i) return;
    Object.assign(i, { 
      title: d.title || i.title, 
      description: d.description || i.description, 
      status: d.status || i.status 
    });
    await save(`Issue #${i.id} updated`);
  });

  socket.on('addComment', async d => {
    const i = issues.find(x => x.id === d.id);
    if (!i) return;
    i.comments.push({
      author: d.author || 'Anonymous',
      text: d.text,
      time: new Date().toISOString()
    });
    await save(`Comment added to Issue #${i.id}`);
  });
});

loadIssues().then(() => {
  server.listen(3000, () => console.log('Server on http://localhost:3000'));
});
