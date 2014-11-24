"use strict";

var args    = process.argv.slice(2);
var async   = require('async');
var http    = require('http');
var fs      = require('fs');
var request = require('request');
var exec    = require('child_process').exec;
var url     = require('url');

if (args.length !== 2) {
	console.log("you need to provide 2 urls of ps2 with starting frame");
}
else {
	var source = parsePhotosynthUrl(args[0]);
	var target = parsePhotosynthUrl(args[1]);

	request.post("https://photosynth.net/rest/experimental/connections", {json: {
		Source: {
			CollectionId: source.guid,
			SIndex: source.sIndex
		},
		Target: {
			CollectionId: target.guid,
			SIndex: target.sIndex
		}
	}}, function(error, response, body) {
		var outputFolder = "connections\\"+source.guid + "_" + source.sIndex + "__to__" + target.guid + "_" + target.sIndex+"/";

		fs.mkdir(outputFolder, function() {

			downloadMinimalPS2(source, outputFolder+"source/", body.Source, function() {
				downloadMinimalPS2(target, outputFolder+"target/", body.Target, function() {

					//run linker module
					var cmd = 'bin\\Synther ';
					cmd += "-cid0 " + source.guid.toLowerCase() + " -frame0 " + source.sIndex + " -synthPath0 " + outputFolder + "source/ ";
					cmd += "-cid1 " + target.guid.toLowerCase() + " -frame1 " + target.sIndex + " -synthPath1 " + outputFolder + "target/ ";
					cmd += "-key " + body.Key;

					//console.log(cmd);
					exec(cmd, function (/*error, stdout, stderr*/) {
						//console.log("stdout: " + stdout);
						//console.log("stderr: " + stderr);

						var paddedSourceIndex = (source.sIndex < 10 ? "0" : "") + source.sIndex;
						var paddedTargetIndex = (target.sIndex < 10 ? "0" : "") + target.sIndex;

						var baseFilename = target.guid+"_"+paddedSourceIndex+"_"+paddedTargetIndex+"_";

						fs.rename(outputFolder+"source/"+baseFilename+"connection.json", outputFolder+"connection.json", function() {
							fs.rename(outputFolder+"source/"+baseFilename+"connection.ply", outputFolder+"connection.ply", function() {
								fs.rename(outputFolder+"source/"+baseFilename+"synth.ply", outputFolder+"synth.ply", function() {
									fs.unlink(outputFolder+"source/"+baseFilename+"targetCameras.json", function() {
										return 0;
									});
								});
							});
						});
					});
				});
			});
		});
	});
}

function getPacketBaseUrl(guid) {
	return "http://cdn.photosynth.net/ps2/" + guid + "/packet/";
}

function downloadMinimalPS2(ps2, outputFolder, urls, dl_callback) {

	var baseUrl = getPacketBaseUrl(ps2.guid);

	var body = '';
	http.get(baseUrl + "0.json", function(res) {
		res.on('data', function(chunk) {
			body += chunk;
		});
		res.on('end', function() {

			//create output folder
			fs.mkdir(outputFolder, function() {

				fs.writeFile(outputFolder + "0.json", body, 'ascii', function(/*err*/) {

					outputFolder+= "l0/";
						fs.mkdir(outputFolder, function() {

						//download jpegs
						var q = async.queue(function (task, callback) {
							downloadFileToDisk(task, outputFolder, callback);
						}, 6);

						q.push(urls.map(function(u) {
							return {
								url: u,
								filename: extractFilename(u)
							};
						}));

						//oncomplete callback
						q.drain = function() {
							console.log('All images of ' + ps2.guid + ' have been downloaded');
							dl_callback();
						};
					});

				});

			});

		});
	}).on('error', function(e) {
		console.log("Got error: " + e.message);
	});
}

function downloadFileToDisk(task, outputFolder, callback) {
	request({
	url: task.url,
	encoding: "binary",
	}, function(err, response, body) {
		fs.writeFile(outputFolder + task.filename, body, 'binary', function() {
			callback();
		});
	});
}

function parsePhotosynthUrl(url) {
	//https://photosynth.net/preview/view/43896637-f96a-41fb-94ad-39b92db79c18?startat=199 -> {guid: 43896637-f96a-41fb-94ad-39b92db79c18, sIndex: 199}

	var tmp    = url.replace("https://photosynth.net/preview/view/", "").split("?");
	var guid   = tmp[0];
	var sIndex = tmp.length > 1 ? parseInt(tmp[1].replace("startat=", ""), 10) : 0;

	return {
		guid: guid,
		sIndex: sIndex
	};
}

function extractFilename(u) {
	return url.parse(u).pathname.split('/').pop();
}
