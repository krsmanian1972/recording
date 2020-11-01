const express = require('express');
const https = require('http');
const cors = require('cors');
const recordingServer = require('./recordingServer');

const bind_port = 4002;

const app = express();
app.use(cors());

app.get("/",(req,res) => {
	res.send("This is the session recording server for Ferris");
});

const server = https.createServer(app);

server.listen(bind_port, ()=>{
	recordingServer(server);
	console.log('Recording Server is started and listening at '+bind_port);
});

