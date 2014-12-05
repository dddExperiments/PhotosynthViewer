"use strict";

var Mongo = require('mongodb').MongoClient;

var _db;
var _collection;

Mongo.connect("mongodb://localhost:27017/ps2", function(err, db) {
	if (err) {
		console.log("Error: please start mongod first!");
		return;
	}
	else {
		_collection = db.collection("synths");
		_collection.find().toArray(function(/*err, items*/) {
		});
		_db = db;
	}
});

exports.findAll = function(req, res) {
	_db.collection('synths', function(err, collection) {
		collection.find().toArray(function(err, items) {
			res.send(items);
		});
	});
};

exports.findByGuid = function(req, res) {
	var guid = req.params.id;
	_db.collection('synths', function(err, collection) {
		collection.findOne({'guid': guid}, function(err, item) {

			if (item) {
				res.send(item.annotations);
			}
			else {
				res.send([]);
			}
		});
	});
};

function findNextIdAvailable(annotations) {
	var dbid = 1;
	if (annotations.length !== 0) {
		//use biggest dbid + 1 as database id for this annotation
		dbid = annotations.map(function(a) { return a.dbid; }).sort(function(a,b){return b-a;})[0] + 1;
		if (dbid === 0) {
			dbid = 1;
		}
	}
	return dbid;
}

exports.insertAnnotation = function(req, res) {
	var guid = req.params.id;

	var annotation = JSON.parse(req.body);

	_db.collection('synths', function(err, collection) {
		collection.findOne({'guid': guid}, function(err, item) {

			if (item) {
				//this synth was already in db, just insert new annotation

				var dbid = findNextIdAvailable(item.annotations);
				annotation.dbid = dbid;
				item.annotations.push(annotation);

				collection.update({'guid': guid}, item, function(){
					res.end(JSON.stringify({dbid: dbid}));
				});
			}
			else {
				//this synth was not in db, create it and insert new annotation

				annotation.dbid = 1;

				var synth = {
					guid: guid,
					annotations: [annotation]
				};

				collection.insert(synth, {safe:true}, function(/*err, result*/) {
					res.end(JSON.stringify({dbid: 1}));
				});

			}
		});
	});
};

exports.updateAnnotation = function(req, res) {
	var guid = req.params.id;

	var annotation = JSON.parse(req.body);

	_db.collection('synths', function(err, collection) {
		collection.findOne({'guid': guid}, function(err, item) {

			if (item) {
				//this synth was already in db, just update the annotation

				var index = item.annotations.map(function(a) { return a.dbid; }).indexOf(annotation.dbid);
				if (index === -1) { //Not tested :(
					//weird... this annotation was not found, just insert it

					var dbid = findNextIdAvailable(item.annotations);
					annotation.dbid = dbid;
					item.annotations.push(annotation);

					collection.update({'guid': guid}, item, function(){
						res.end(JSON.stringify({dbid: dbid}));
					});
				}
				else {
					var annotationInDB = item.annotations[index];
					if (annotationInDB.transform) {
						annotation.transform = annotationInDB.transform;
					}
					annotation.dbid = annotationInDB.dbid;
					item.annotations[index] = annotation;

					collection.update({'guid': guid}, item, function(){
						res.end(JSON.stringify({dbid: annotation.dbid}));
					});
				}
			}
			else {
				//weird... this synth was not found -> fallback to insert.
				return exports.insertAnnotation(req, res); //Not tested :(
			}
		});
	});
};

exports.deleteAnnotation = function(req, res) {
	var guid = req.params.id;

	var annotation = JSON.parse(req.body);

	_db.collection('synths', function(err, collection) {
		collection.findOne({'guid': guid}, function(err, item) {

			if (item) {
				//this synth is in db, remove the corresponding annotation

				var dbid = annotation.dbid;
				if (dbid !== 0) {
					item.annotations = item.annotations.filter(function(a) { return a.dbid !== dbid; });

					if (item.annotations.length > 0) {
						collection.update({'guid': guid}, item, function(){
							res.end();
						});
					}
					else {
						collection.remove({'guid': guid}, function(){
							res.end();
						});
					}
				}
				else {
					//something went wrong dbid should start at 1
					res.end();
				}

				var dbid = 1;
				if (item.annotations.length !== 0) {
					//use biggest dbid + 1 as database id for this annotation
					dbid = item.annotations.map(function(a) { return a.dbid; }).sort(function(a,b){return b-a;})[0] + 1;
					if (dbid === 0) {
						dbid = 1;
					}
				}
			}
			else {
				//something went wrong :( trying to delete the annotation of an unknown synth.
				res.end();
			}
		});
	});
};

exports.addConnectionInfo = function(req, res) {
	var body = JSON.parse(req.body);
	var guid = body.source.guid;
	var dbid = body.source.annotationDBID;

	_db.collection('synths', function(err, collection) {
		collection.findOne({'guid': guid}, function(err, item) {

			if (item) {
				//this synth was already in db, just update the annotation

				var index = item.annotations.map(function(a) { return a.dbid; }).indexOf(dbid);
				if (index === -1) { //Not tested :(
					res.end();
				}
				else {
					item.annotations[index].transform = body.transform;
					collection.update({'guid': guid}, item, function(){
						res.end();
					});
				}
			}
			else {
				//something went wrong :( trying to add a connection to an unknown synth
				res.end();
			}
		});
	});
};

exports.clear = function(req, res) {
	_db.collection('synths', function(err, collection) {
		collection.drop();

		res.end("DB empty");
	});
};

exports.index = function(req, res) {

	
	//get list of synths in the database
	_db.collection('synths', function(err, collection) {
		collection.find().toArray(function(err, items) {
			var guids = items.map(function(c) { return c.guid; });
			
				var htmlContent = "";
				htmlContent += "<style>\n";
				htmlContent += "body { font-family: Segoe UI; }\n";
				htmlContent += "</style>\n";

				htmlContent += "<script>\n";
				htmlContent += "function gotoSynth(guid) { if (guid) { window.location.href='/synths/'+guid; }}\n";
				htmlContent += "</script>\n";

				htmlContent += "<h1>Experimental AnnotationStorage</h1>\n";
				htmlContent += "<p>There are "+ guids.length + " synths in the database.</p>\n";

				if (guids.length > 0) {

					htmlContent += "<h3>Actions</h3>\n";

					var selectHtmlContent = "";
					selectHtmlContent += "<select onchange='gotoSynth(this.value)'>";
					selectHtmlContent += "<option value=''>Select guid</option>";
					guids.forEach(function(guid) {
						selectHtmlContent += "<option value="+guid+">"+guid+"</option>";
					});
					selectHtmlContent += "</select>";

					htmlContent += "<ul>\n";
					htmlContent += "	<li>See all synths: <button onclick=\"window.location.href='/synths'\">go</button></li>\n";
					htmlContent += "	<li>See a specific synth: "+selectHtmlContent+"</li>\n";
					htmlContent += "</ul>\n";
					htmlContent += "<br />\n";
					htmlContent += "<br />\n";
					htmlContent += "<p>Clear database: <button onclick=\"window.location.href='/clear'\">go</button> <strong>It will empty the database without warning!</strong></p>\n";
					htmlContent += "<p>Powered by node.js + Mongodb.</p>\n";
				}
				res.writeHead(200, {'Content-Type': 'text/html'});
				res.end(htmlContent);
		});
	});

};
