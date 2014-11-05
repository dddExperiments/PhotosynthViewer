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

	PS.Packet.Annotation.GeometryService:
	-------------------------------------
	This class is responsible for downloading and parsing the geometry used to compute the 3d position of an annotation.

*/

PS.Packet.Annotation.GeometryService = function() {

	function Plane(normal, depth) {
		this.normal = normal;
		this.depth = depth;
	}

	this.getGeometryPlane = function(packetRoot, geomIndex, camIndex, point, onComplete) {

		var geomURL = packetRoot + "/geometry/geometry_"+geomIndex+".bin";
		download(geomURL, function(arrayBuffer) {
			var plane = parseGeometryFile(arrayBuffer, camIndex, point);
			onComplete(plane);
		});
	};

	function download(url, onComplete) {
		new PS.Utils.Request(url, {
			responseType: "arraybuffer",
			onComplete: function(xhr) {
				onComplete(xhr.response);
			}
			/*TODO: do something on failure/error */
		});
	}

	function parsePolygonFile(view, offset, point) {
		var w = view.getUint16(offset, true); offset += 2; //width
		var h = view.getUint16(offset, true); offset += 2; //height
		var nbPolygons = view.getUint16(offset, true); offset += 2;
		var nbVerticesTotal = view.getUint32(offset, true); offset += 4;
		var nbIndicesTotal  = view.getUint32(offset, true); offset += 4;

		var queryX = Math.floor(w*point.x);
		var queryY = Math.floor(h*point.y);

		//bounding sphere
		//jshint unused:false
		var sphereX = view.getFloat32(offset, true); offset+=4;
		var sphereY = view.getFloat32(offset, true); offset+=4;
		var sphereZ = view.getFloat32(offset, true); offset+=4;
		var sphereR = view.getFloat32(offset, true); offset+=4;

		var bbox = {
			minX: 0,
			minY: 0,
			maxX: 0,
			maxY: 0
		};

		var tempVerticesX  = new Uint16Array(nbVerticesTotal);
		var tempVerticesY  = new Uint16Array(nbVerticesTotal);
		var tempIndices    = new Uint16Array(nbIndicesTotal);
		var currentIndices = new Uint16Array(3);

		for (var i=0; i<nbPolygons; ++i) {
			var planeId = view.getUint16(offset, true); offset += 2;
			var nbVertices  = view.getUint16(offset, true); offset += 2;
			var nbTriangles = view.getUint16(offset, true); offset += 2;
			var srcX = view.getUint16(offset, true); offset += 2;
			var srcY = view.getUint16(offset, true); offset += 2;

			bbox.minX = srcX;
			bbox.minY = srcY;
			bbox.maxX = srcX;
			bbox.maxY = srcY;

			var currentX = srcX;
			var currentY = srcY;

			tempVerticesX[0] = currentX;
			tempVerticesY[0] = currentY;

			for (var j=1; j<nbVertices; ++j) {
				currentX += view.getInt16(offset, true); offset += 2;
				currentY += view.getInt16(offset, true); offset += 2;

				tempVerticesX[j] = currentX;
				tempVerticesY[j] = currentY;

				bbox.minX = Math.min(bbox.minX, currentX);
				bbox.minY = Math.min(bbox.minY, currentY);
				bbox.maxX = Math.max(bbox.maxX, currentX);
				bbox.maxY = Math.max(bbox.maxY, currentY);
			}

			var indexZero = view.getUint16(offset, true); offset += 2;
			tempIndices[0] = indexZero;
			var currentIndex = indexZero;
			var indexLength = nbTriangles*3-1;
			for (var j=0; j<indexLength; ++j) {
				currentIndex += view.getInt16(offset, true); offset += 2;
				tempIndices[j+1] = currentIndex;
			}

			var isInsideBbox =  queryX >= bbox.minX && queryX <= bbox.maxX &&
								queryY >= bbox.minY && queryY <= bbox.maxY;

			if (isInsideBbox) {
				var indexTriangle = 0;
				for (var j=0; j<nbTriangles; ++j) {
					currentIndices[0] = tempIndices[indexTriangle++];
					currentIndices[1] = tempIndices[indexTriangle++];
					currentIndices[2] = tempIndices[indexTriangle++];
					if (isInsideTriangle(tempVerticesX, tempVerticesY, currentIndices, queryX, queryY)) {
						return planeId;
					}
				}
			}
		}

		return -1;
	}

	function parseGeometryFile(arrayBuffer, cameraIndex, point) {

		var view = new DataView(arrayBuffer);

		//parsing geometry file:

		var offset = 0;

		var nbGeometries = view.getUint16(offset, true); offset+=2;
		var nbCameras = nbGeometries;

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

		for (var i=0; i<cameraIndex; ++i) { //skipping cameras before the needed one
			offset += polygonSizes[i];
		}
		var intersectedPlaneId = parsePolygonFile(view, offset, point);
		//offset += polygonSizes[cameraIndex]; //TODO: is it needed?
		for (var i=cameraIndex; i<nbCameras; ++i) { //skipping cameras after the needed one
			offset += polygonSizes[i];
		}

		//parsing 3d planes

		for (var i=0; i<cameraIndex; ++i) { //skipping cameras before the needed one
			offset += planeSizes[i];
		}
		var nbPlanes = planeSizes[cameraIndex]/16;
		var planes = new Array(nbPlanes);
		for (var i=0; i<nbPlanes; ++i) { //TODO: skip and only parse the intersected planeId
			var a = view.getFloat32(offset, true); offset+=4;
			var b = view.getFloat32(offset, true); offset+=4;
			var c = view.getFloat32(offset, true); offset+=4;
			var d = view.getFloat32(offset, true); offset+=4;
			planes[i] = new Plane(new THREE.Vector3(a, b, c), d);
		}

		return intersectedPlaneId !== -1 ? planes[intersectedPlaneId] : {};
	}
};

//The following method was ported and optimized to avoid garbage collections from:
//http://stackoverflow.com/questions/2049582/how-to-determine-a-point-in-a-triangle

//Fast barycentric coordinates method (Perro Azul answer to Andreas Brinck)
function isInsideTriangle(bufferX, bufferY, indices, queryX, queryY) {
	var area = 1/2 * (-bufferY[indices[1]] * bufferX[indices[2]] + bufferY[indices[0]] * (-bufferX[indices[1]] + bufferX[indices[2]]) + bufferX[indices[0]] * (bufferY[indices[1]] - bufferY[indices[2]]) + bufferX[indices[1]] * bufferY[indices[2]]);
	var sign = area < 0 ? -1 : 1;
	var s = (bufferY[indices[0]] * bufferX[indices[2]] - bufferX[indices[0]] * bufferY[indices[2]] + (bufferY[indices[2]] - bufferY[indices[0]]) * queryX + (bufferX[indices[0]] - bufferX[indices[2]]) * queryY) * sign;
	var t = (bufferX[indices[0]] * bufferY[indices[1]] - bufferY[indices[0]] * bufferX[indices[1]] + (bufferY[indices[0]] - bufferY[indices[1]]) * queryX + (bufferX[indices[1]] - bufferX[indices[0]]) * queryY) * sign;

	//It should answer yes on the edge as well with the <= instead of < ?
	return s >= 0 && t >= 0 && (s + t) <= 2 * area * sign;
}
