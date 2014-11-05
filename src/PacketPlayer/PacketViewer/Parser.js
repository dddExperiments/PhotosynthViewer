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

PS.Packet.QuantizedPose = function(p, o) {
	this.position    = p;
	this.orientation = o;
	this.nextIndex   = 0;
	this.prevIndex   = 0;
	this.fov         = 0;
	this.speed       = 1.0;
};

PS.Packet.Pose = function(p, o) {
	this.position    = p;
	this.orientation = o;
};

PS.Packet.Pose.prototype.copy = function(p) {
	this.position.copy(p.position);
	this.orientation.copy(p.orientation);

	return this;
};

PS.Packet.Pose.prototype.clone = function() {
	return new PS.Packet.Pose(new THREE.Vector3(), new THREE.Quaternion()).copy(this);
};

PS.Packet.Plane = function(normal, depth) {
	this.normal = normal;
	this.depth = depth;
};

PS.Packet.Parsers = {};

PS.Packet.Parsers.parsePathFile = function(arrayBuffer) {
	var view = new DataView(arrayBuffer);

	var offset = 0;
	var nbPoints = view.getUint16(0, true); offset += 2;
	var points = new Array(nbPoints);

	for (var i=0; i<nbPoints; ++i) {
		var x = view.getFloat32(offset, true); offset+=4;
		var y = view.getFloat32(offset, true); offset+=4;
		var z = view.getFloat32(offset, true); offset+=4;

		var p = new THREE.Vector3(x,y,z);

		var qx = view.getFloat32(offset, true); offset+=4;
		var qy = view.getFloat32(offset, true); offset+=4;
		var qz = view.getFloat32(offset, true); offset+=4;
		var squaredqw = 1-qx*qx-qy*qy-qz*qz;
		var qw = squaredqw > 1e-6 ? Math.sqrt(squaredqw) : 0;

		var q = new THREE.Quaternion(qx, qy, qz, qw);
		points[i] = new PS.Packet.QuantizedPose(p, q);
	}
	return points;
};
