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

	PS.Packet.WebGLMU:
	------------------
	This object is a providing data for the hidden 42 menu concerning the GPU memory usage of textures and buffers.

*/

PS.Packet.WebGLMU = new function() {
	this.textureMemoryAmount = 0;
	this.buffersMemoryAmount = 0;

	this.addTexture = function(size, q) {
		if (q) {
			console.warn(size);
		}
		this.textureMemoryAmount += size;
	};

	this.addBuffer = function(size, q) {
		if (q) {
			console.warn(size);
		}
		this.buffersMemoryAmount += size;
	};

	this.info = function() {
		console.log("Textures: " + Math.round(this.textureMemoryAmount/(1024*1024))+"mo, Buffers: " + Math.round(this.buffersMemoryAmount/(1024*1024))+"mo");
	};
};
