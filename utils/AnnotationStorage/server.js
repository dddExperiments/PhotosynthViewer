"use strict";

var _port = 3000;

var express = require('express');
var synths = require('./routes/synths');

var app = express();

app.all('/*', function(req, res, next) {
	res.header("Access-Control-Allow-Origin", "*");
	res.header("Access-Control-Allow-Headers", "X-Requested-With");
	res.header("Access-Control-Allow-Methods", "GET, PUT, POST, DELETE, OPTIONS");

	if (req.method === 'POST' || req.method === 'DELETE' || req.method === 'PUT' || req.method === 'OPTIONS') {

		//This is a very bad way of reading the body of the request
		//TODO: fix this!

		var data = '';
		req.on('data', function (chunk) {
			data += chunk;
		});
		req.on('end', function () {
			req.body = data;
			next();
		});
	}
	else {
		next();
	}
});

app.get('/status', function(req, res) {
	res.send("OK");
});
app.get('/',              synths.index);
app.get('/clear',         synths.clear);
app.get('/synths',        synths.findAll);
app.get('/synths/:id',    synths.findByGuid);
app.post('/synths/:id',   synths.insertAnnotation);
app.put('/synths/:id',    synths.updateAnnotation);
app.delete('/synths/:id', synths.deleteAnnotation);

app.post('/addConnectionInfo', synths.addConnectionInfo);

app.listen(_port);
console.log('Annotation storage started on port: ' + _port);
console.log('You can go to http://localhost:' + _port + '/ to see some information about the storage');
