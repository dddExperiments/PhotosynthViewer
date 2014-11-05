"use strict";

/*
	The MIT License (MIT)

	Copyright (c) Microsoft Corporation

	Permission is hereby granted, free of charge, to any person obtaining a copy
	of this software and associated documentation files (the "Software"), to deal
	in the Software without restriction, including without limitation the rights
	to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
	copies of the Software, and to permit persons to whom the Software is
	furnished to do so, subject to the following conditions:

	The above copyright notice and this permission notice shall be included in
	all copies or substantial portions of the Software.

	THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
	IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
	FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
	AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
	LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
	OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
	THE SOFTWARE.
*/

/* global self */

function Vector3(x,y,z) {
	this.x = x;
	this.y = y;
	this.z = z;
}

function Plane(normal, depth) {
	this.normal = normal;
	this.depth = depth;
}

function Color() {
	this.r = Math.random();
	this.g = Math.random();
	this.b = Math.random();
}

function ColorGenerator() {
	this.dictionnary = {};

	this.getColor = function(planeId) {
		if (this.dictionnary[planeId] === undefined) {
			this.dictionnary[planeId] = new Color();
		}
		return this.dictionnary[planeId];
	};
}

function WorkerCamera(cam) {
	this.position    = new Float32Array([cam.position.x, cam.position.y, cam.position.z]);
	this.cameraFront = new Float32Array([cam.cameraFront.x, cam.cameraFront.y, cam.cameraFront.z]);
	this.cameraUp    = new Float32Array([cam.cameraUp.x, cam.cameraUp.y, cam.cameraUp.z]);
	this.cameraRight = new Float32Array([cam.cameraRight.x, cam.cameraRight.y, cam.cameraRight.z]);
	this.my          = cam.my;
	this.mx          = cam.mx;
}

function WorkerGeometry(indices, vertices, colors, w, h) {
	this.indices  = indices;
	this.vertices = vertices;
	this.colors   = colors || [];
	this.width    = w;
	this.height   = h;
}

//Ray / plane intersection
function intersectPoint(camera, plane, px, py, result) {

	//Vec3d ray = camera.front + camera.right*px*camera.mx + camera.up*py*camera.my;
	var pxmx = px*camera.mx;
	var pymy = py*camera.my;
	result[0] = camera.cameraFront[0] + camera.cameraRight[0]*pxmx + camera.cameraUp[0]*pymy;
	result[1] = camera.cameraFront[1] + camera.cameraRight[1]*pxmx + camera.cameraUp[1]*pymy;
	result[2] = camera.cameraFront[2] + camera.cameraRight[2]*pxmx + camera.cameraUp[2]*pymy;

	//ray = ray.Unit();
	var norm = Math.sqrt(result[0]*result[0] + result[1]*result[1] + result[2]*result[2]);
	result[0] = result[0] / norm;
	result[1] = result[1] / norm;
	result[2] = result[2] / norm;

	//double t = -(plane.normal.dot(camera.position) + plane.depth / (plane.normal.dot(ray);
	var position = camera.position;
	var normal = plane.normal;
	var t = -(position[0]*normal.x + position[1]*normal.y + position[2]*normal.z + plane.depth) / (result[0]*normal.x + result[1]*normal.y + result[2]*normal.z);

	//CVec3d p = CVec3d(c.pos) + ray*t;
	result[0] = position[0] + result[0]*t;
	result[1] = position[1] + result[1]*t;
	result[2] = position[2] + result[2]*t;

	return result;
}

function projectVerticesInPlace(planes, polygons, camera) {
	var nbVertices = polygons.vertices.length / 3;

	var vertices = polygons.vertices;
	var w = polygons.imgWidth-1;
	var h = polygons.imgHeight-1;
	var tempResult = new Float32Array(3);
	for (var i=0; i<nbVertices; ++i) {
		var indexA = i*3;
		var indexB = indexA+1;
		var indexC = indexA+2;

		var x = vertices[indexA];
		var y = vertices[indexB];
		var px = -1 + 2*x/w;
		var py =  1 - 2*y/h;

		var planeId = vertices[indexC];
		var plane   = planes[planeId];

		tempResult = intersectPoint(camera, plane, px, py, tempResult);
		vertices[indexA] = tempResult[0];
		vertices[indexB] = tempResult[1];
		vertices[indexC] = tempResult[2];
	}
}

function ArrayReader(input) {
	var _view = new DataView(input);
	var _offset = 0;

	function getUint8() {
		return _view.getUint8(_offset++);
	}

	function getFloat32() {
		var value = _view.getFloat32(_offset, false); //big endian
		_offset+=4;
		return value;
	}

	this.ReadCompressedInt = function() {
		var i = 0;
		var b;
		do {
			b = getUint8();
			i = (i << 7) | (b & 127);
		} while (b < 128);

		return i;
	};

	this.ReadBigEndianSingle = function() {
		return getFloat32();
	};

	this.ReadBigEndianUInt16 = function() {
		var b0 = getUint8();
		var b1 = getUint8();

		return (b1 | b0 << 8);
	};
}

function parsePS1BinFile(data) {

	var input = new ArrayReader(data);
	var versionMajor  = input.ReadBigEndianUInt16();
	var versionMinor  = input.ReadBigEndianUInt16();

	if (versionMajor !== 1 || versionMinor !== 0) {
		return false;
	}

	var nbImages = input.ReadCompressedInt();

	var infos = [];
	for (var i=0; i<nbImages; ++i) {
		var nbInfo = input.ReadCompressedInt();
		for (var j=0; j<nbInfo; j++) {
			var vertexIndex = input.ReadCompressedInt();
			var range       = input.ReadCompressedInt();
			infos.push([i, vertexIndex, range]);
		}
	}

	var nbVertices = input.ReadCompressedInt();
	var vertsArray = new Float32Array(nbVertices * 3);
	var colsArray  = new Float32Array(nbVertices * 3); //TODO: Uint8Array
	var viewList   = new Array(nbVertices);

	for (var i=0; i<nbVertices; i++) {
		vertsArray[i*3+0] = input.ReadBigEndianSingle(); //x
		vertsArray[i*3+1] = input.ReadBigEndianSingle(); //y
		vertsArray[i*3+2] = input.ReadBigEndianSingle(); //z

		var color = input.ReadBigEndianUInt16();
		var r = (((color >> 11) * 255) / 31) & 0xff;
		var g = ((((color >> 5) & 63) * 255) / 63) & 0xff;
		var b = (((color & 31) * 255) / 31) & 0xff;
		colsArray[i*3+0] = r/255; //TODO: remove /255 for Uint8
		colsArray[i*3+1] = g/255;
		colsArray[i*3+2] = b/255;

		viewList[i] = [];
	}

	for (var i=0; i<infos.length; ++i) {
		var info = infos[i]; //[pictureIndex, vertexIndex, range]
		for (var j=info[1]; j<info[1]+info[2]; ++j) {
			viewList[j].push(info[0]);
		}
	}

	var nbTracks = 0;
	for (var i=0; i<viewList.length; ++i) {
		if (viewList[i].length > 2) {
			nbTracks++;
		}
	}

	return new PointCloudParsingResult(nbTracks, nbVertices, vertsArray, colsArray, viewList);
}

//Store parsing result in Class instead of {} to make v8 happy
function PointCloudParsingResult(nbTracks, nbVertices, positions, colors, viewList) {
	this.nbTracks   = nbTracks; //nbTracks of length > 2
	this.nbVertices = nbVertices;
	this.positions  = positions;
	this.colors     = colors;
	this.viewList   = viewList;
}

function parsePolygonFile(view, offset, debugBlendingEnabled) {
	var w = view.getUint16(offset, true); offset += 2; //width
	var h = view.getUint16(offset, true); offset += 2; //height
	var nbPolygons = view.getUint16(offset, true); offset += 2;
	var nbVerticesTotal = view.getUint32(offset, true); offset += 4;
	var nbIndicesTotal  = view.getUint32(offset, true); offset += 4;

	//bounding sphere
	//jshint unused:false
	var sphereX = view.getFloat32(offset, true); offset+=4;
	var sphereY = view.getFloat32(offset, true); offset+=4;
	var sphereZ = view.getFloat32(offset, true); offset+=4;
	var sphereR = view.getFloat32(offset, true); offset+=4;

	var vertexComponentCounter = 0;
	var colorComponentCounter = 0;
	var indexCounter  = 0;
	var globalVertices = new Float32Array(nbVerticesTotal*3);
	var globalIndices  = new Uint16Array(nbIndicesTotal);
	var globalColors   = debugBlendingEnabled ? new Float32Array(nbVerticesTotal*3) : []; //TODO: switch to Uint8Array when three.js can handle non float color
	var colorGenerator = new ColorGenerator();
	var indexOffset = 0;
	for (var i=0; i<nbPolygons; ++i) {
		var planeId = view.getUint16(offset, true); offset += 2;
		var color = colorGenerator.getColor(planeId);
		var nbVertices  = view.getUint16(offset, true); offset += 2;
		var nbTriangles = view.getUint16(offset, true); offset += 2;
		var srcX = view.getUint16(offset, true); offset += 2;
		var srcY = view.getUint16(offset, true); offset += 2;

		globalVertices[vertexComponentCounter++] = srcX;
		globalVertices[vertexComponentCounter++] = srcY;
		globalVertices[vertexComponentCounter++] = planeId;
		if (debugBlendingEnabled) {
			globalColors[colorComponentCounter++] = color.r;
			globalColors[colorComponentCounter++] = color.g;
			globalColors[colorComponentCounter++] = color.b;
		}

		var x = srcX;
		var y = srcY;
		for (var j=1; j<nbVertices; ++j) {
			x += view.getInt16(offset, true); offset += 2;
			y += view.getInt16(offset, true); offset += 2;
			globalVertices[vertexComponentCounter++] = x;
			globalVertices[vertexComponentCounter++] = y;
			globalVertices[vertexComponentCounter++] = planeId;
			if (debugBlendingEnabled) {
				globalColors[colorComponentCounter++] = color.r;
				globalColors[colorComponentCounter++] = color.g;
				globalColors[colorComponentCounter++] = color.b;
			}
		}

		var indexZero = view.getUint16(offset, true); offset += 2;
		indexZero += indexOffset;
		globalIndices[indexCounter++] = indexZero;

		var currentIndex = indexZero;
		var indexLength = nbTriangles*3-1;
		for (var j=0; j<indexLength; ++j) {
			currentIndex += view.getInt16(offset, true); offset += 2;
			globalIndices[indexCounter++] = currentIndex;
		}
		indexOffset += nbVertices;
	}
	return new PolygonParsingResult(globalVertices, globalIndices, globalColors, w, h);
}

//Store parsing result in Class instead of {} to make v8 happy
function PolygonParsingResult(vertices, indices, colors, w, h) {
	this.vertices    = vertices;
	this.indices     = indices;
	this.colors      = colors;
	this.imgWidth    = w;
	this.imgHeight   = h;
}

self.onmessage = function(evt) {
	if (evt.data.type === "createGeometry") {
		var camerasSerialized   = evt.data.cameras;
		var nbCameras           = camerasSerialized.length;
		var debugBlendingEnabled = evt.data.debugBlendingEnabled;

		var cameras  = new Array(nbCameras);
		var polygons = new Array(nbCameras);
		var planes   = new Array(nbCameras);

		for (var i=0; i<nbCameras; ++i) {
			cameras[i] = new WorkerCamera(camerasSerialized[i]);
		}

		var startParsing = new Date();
		var view = new DataView(evt.data.buffer);
		var offset = 0;

		var nbGeometries = view.getUint16(offset, true); offset+=2;

		if (nbGeometries !== nbCameras) {
			self.postMessage({
				type: "log",
				msg: "Error: nbGeometries != nbCameras",
				fileIndex: evt.data.fileIndex
			});
			return;
		}

		//parsing size of polygons and 3d planes
		var planeSizes   = new Array(nbCameras);
		var polygonSizes = new Array(nbCameras);
		var totalPolygonsSizes = 0;
		var totalPlanesSize    = 0;
		for (var i=0; i<nbCameras; ++i) {
			var currentPolygonSize = view.getUint32(offset,  true); offset+=4;
			var currentPlaneSize   = view.getUint32(offset, true);  offset+=4;
			polygonSizes[i] = currentPolygonSize;
			planeSizes[i]   = currentPlaneSize;
			totalPolygonsSizes += currentPolygonSize;
			totalPlanesSize    += currentPlaneSize;
		}

		//parsing polygons
		for (var i=0; i<nbCameras; ++i) {
			polygons[i] = parsePolygonFile(view, offset, debugBlendingEnabled);
			offset += polygonSizes[i];
		}

		//parsing 3d planes
		for (var i=0; i<nbCameras; ++i) {
			var nbPlanes = planeSizes[i]/16;
			var currentPlanes = new Array(nbPlanes);
			for (var j=0; j<nbPlanes; ++j) {
				var a = view.getFloat32(offset, true); offset+=4;
				var b = view.getFloat32(offset, true); offset+=4;
				var c = view.getFloat32(offset, true); offset+=4;
				var d = view.getFloat32(offset, true); offset+=4;
				currentPlanes[j] = new Plane(new Vector3(a, b, c), d);
			}
			planes[i] = currentPlanes;
		}
		var parsingTime = new Date()-startParsing;

		//projecting 2d vertices with planeId to have 3d vertices
		var startProjecting = new Date();
		var geometries = new Array(nbCameras);
		//var buffers = new Array(nbCameras*(debugBlendingEnabled ? 3 : 2)); //indices, vertices, colors
		//var bufferOffset = 0;
		for (var i=0; i<nbCameras; ++i) {
			var currentPolygons = polygons[i];
			projectVerticesInPlace(planes[i], currentPolygons, cameras[i]);
			geometries[i] = new WorkerGeometry(currentPolygons.indices, currentPolygons.vertices, currentPolygons.colors, currentPolygons.imgWidth, currentPolygons.imgHeight);
			//buffers[bufferOffset++] = currentPolygons.indices.buffer;
			//buffers[bufferOffset++] = currentPolygons.vertices.buffer;
			//if (debugBlendingEnabled) {
			//	buffers[bufferOffset++] = currentPolygons.colors.buffer;
			//}
		}
		var projectingTime = new Date()-startProjecting;

		self.postMessage({
			"type": "geometry",
			"result": geometries,
			"parsingTime" : parsingTime,
			"projectingTime": projectingTime,
			"startCameraIndex": evt.data.startCameraIndex,
			"endCameraIndex": evt.data.endCameraIndex,
			"fileIndex": evt.data.fileIndex,
			"rootUrl": evt.data.rootUrl
		}/*, buffers*/);    //Transferable objects from worker is working fine with Chrome
							//But it seems to be broken in Firefox 22 and IE11 is not implementing transferable so it's disable for now.
	}
	else if (evt.data.type === "createPointCloud") {

		var result = parsePS1BinFile(evt.data.buffer);

		//var buffers = [result.positions.buffer, result.colors.buffer];
		self.postMessage({
			"type": "pointCloud",
			"index": evt.data.index,
			"result": result,
			"rootUrl": evt.data.rootUrl
		}/*, buffers*/);    //Transferable objects from worker is working fine with Chrome
							//But it seems to be broken in Firefox 22 and IE11 is not implementing transferable so it's disable for now.
	}
};
