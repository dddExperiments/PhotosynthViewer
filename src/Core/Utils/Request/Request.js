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

PS.Utils.Request = function(url, options) {
	var _options          =  options || {};
	var _onComplete       = _options.onComplete || function() {};
	var _onProgress       = _options.onProgress || function() {};
	var _onError          = _options.onError    || function() {};
	var _responseType     = _options.responseType || "";
	var _method           = _options.method || "GET";
	var _content          = _options.content || null;
	var _headers          = _options.headers || [];
	var _onUploadProgress = _options.onUploadProgress || function() {};

	var xhr = new XMLHttpRequest();
	xhr.open(_method, url, true);
	for (var i=0; i<_headers.length; ++i) {
		var header = _headers[i];
		xhr.setRequestHeader(header.name, header.value);
	}
	if (_responseType) {
		xhr.responseType = _responseType;
	}
	xhr.onreadystatechange = function() {
		if (xhr.readyState === 4) {
			if (xhr.status >= 400 && xhr.status <= 500 || xhr.status === 0) {
				_onError(xhr);
			}
			else {
				_onComplete(xhr);
			}
		}
	};
	xhr.upload.onprogress = function(e) {
		_onUploadProgress(e);
	};
	xhr.onprogress = function(e) {
		_onProgress(e);
	};
	xhr.send(_content);
};
