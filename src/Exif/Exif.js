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

	Reference documents:
	--------------------
	- Exif: http://www.exif.org/Exif2-2.PDF
	- Tiff: http://partners.adobe.com/public/developer/en/tiff/TIFF6.pdf
	- Jpeg: http://www.w3.org/Graphics/JPEG/itu-t81.pdf

	Changelog:

	r4:
		- add a Exif.isJpeg(arrayBuffer) method as we can't rely on browser mime-type to discard non-jpeg file
	r3:
		- add ArrayBuffer.prototype.slice for IE10

	r2:
		- add hasCapturedDate() and getCapturedDate()
			getCapturedDate() is returning the capture date as a javascript Date object or the current date in case of parsing error
		- Fix parsing of Jpeg without thumbnail

	r1:
		- initial revision

*/

if (window.ArrayBuffer && !window.ArrayBuffer.prototype.slice) {
	window.ArrayBuffer.prototype.slice = function(start, end) {
		var partition = new Uint8Array(this).subarray(start, end);
		var result = new Uint8Array(end - start);
		result.set(partition);
		return result.buffer;
	};
}

//jshint unused:false
var Exif = (function () {

	var revision = "4";

	//DataView++ class
	function BinaryReader(arrayBuffer, isLittleEndian) {
		var _arr = arrayBuffer;
		var _view = new DataView(arrayBuffer);
		var _offset = 0;
		var _isLittleEndian = (typeof isLittleEndian === 'undefined') ? true : isLittleEndian;

		//util
		this.seek = function (offset) { //set offset
			checkOffset(0, offset);
			_offset = offset;
		};

		this.tell = function () { //get offset
			return _offset;
		};

		this.setEndianness = function (isLittleEndian) {
			_isLittleEndian = isLittleEndian;
		};

		this.eof = function () {
			return _offset >= _view.byteLength;
		};

		this.getString = function (offset, nbBytes) {
			checkOffset(offset, nbBytes);
			var str = "";
			for (var i = 0; i < nbBytes; ++i) {
				str += String.fromCharCode(this.getUint8(offset + i));
			}
			return str;
		};

		this.getImage = function (offset, length) {
			checkOffset(offset, length);
			var rawImage = _arr.slice(offset, offset + length);

			return new Blob([new Uint8Array(rawImage)], { type: "image/jpeg" });
		};

		function checkOffset(offset, nbBytes) {
			if (offset + nbBytes > _view.byteLength) {
				throw ("Out of range access\nTrying to access offset: " + (offset + nbBytes) + ", length: " + _view.byteLength);
			}
		}

		var types = [
			{ name: "Float32", nbBytes: 4 },
			{ name: "Float64", nbBytes: 8 },
			{ name: "Int8",    nbBytes: 1 },
			{ name: "Int16",   nbBytes: 2 },
			{ name: "Int32",   nbBytes: 4 },
			{ name: "Uint8",   nbBytes: 1 },
			{ name: "Uint16",  nbBytes: 2 },
			{ name: "Uint32",  nbBytes: 4 }
		];

		/*

			The next FOR loop is generating functions like this:
			----------------------------------------------------

			this.getFloat32 = function(offset) {
					var offsetProvided = offset || false;
					if (!offsetProvided) offset = _offset;
					checkOffset(offset, 4);
					var value = _view.getFloat32(offset, _isLittleEndian);
					if (!offsetProvided) _offset += 4;

					return value;
			};

		*/

		//jshint loopfunc: true
		for (var i = 0; i < types.length; ++i) {
			var type = types[i];
			type.name = "get" + type.name;
			this[type.name] = (function () {
				var name	= type.name;
				var nbBytes = type.nbBytes;

				return function (offset) {
					var offsetProvided = offset || false;
					if (!offsetProvided) { offset = _offset; }
					checkOffset(offset, nbBytes);
					var value = _view[name](offset, _isLittleEndian);
					if (!offsetProvided) { _offset += nbBytes; }

					return value;
				};
			})();
		}
		//jshint loopfunc: false

	}

	//XMLHttpRequest class
	function Request(url, options) {
		var _options = options || {};
		var _onComplete = _options.onComplete || function () { };
		var _onProgress = _options.onProgress || function () { };
		var _onError = _options.onError || function () { };
		var _responseType = _options.responseType || "";
		var _method = _options.method || "GET";
		var _content = _options.content || null;
		var _headers = _options.headers || [];
		var _onUploadProgress = _options.onUploadProgress || function () { };

		var xhr = new XMLHttpRequest();
		xhr.open(_method, url, true);
		for (var i = 0; i < _headers.length; ++i) {
			var header = _headers[i];
			xhr.setRequestHeader(header.name, header.value);
		}
		if (_responseType) {
			xhr.responseType = _responseType;
		}
		xhr.onreadystatechange = function () {
			if (xhr.readyState === 4) {
				if (xhr.status >= 400 && xhr.status <= 500) {
					_onError(xhr);
				}
				else {
					_onComplete(xhr);
				}
			}
		};
		xhr.upload.onprogress = function (e) {
			_onUploadProgress(e);
		};
		xhr.onprogress = function (e) {
			_onProgress(e);
		};
		xhr.send(_content);
	}

	var Tags = {};

	//Page numbers refer to this document: http://www.exif.org/Exif2-2.PDF

	//Table 3 TIFF Rev. 6.0 Attribute Information Used in Exif - page 16
	Tags.Tiff = {

		//A. Tags relating to image data structure
		0x0100: ["ImageWidth", "Image width"],
		0x0101: ["ImageHeight", "Image height"],
		0x0102: ["BitsPerSample", "Number of bits per component"],
		0x0103: ["Compression", "Compression scheme"],
		0x0106: ["PhotometricInterpretation", "Pixel composition"],
		0x0112: ["Orientation", "Orientation of image"],
		0x0115: ["SamplesPerPixel", "Number of components"],
		0x011C: ["PlanarConfiguration", "Image data arrangement"],
		0x0212: ["YCbCrSubSampling", "Subsampling ratio of Y to C"],
		0x0213: ["YCbCrPositioning", "Y and C positioning"],
		0x011A: ["XResolution", "Image resolution in width direction"],
		0x011B: ["YResolution", "Image resolution in height direction"],
		0x0128: ["ResolutionUnit", "Unit of X and Y resolution"],

		//B. Tags relating to recording offset
		0x0111: ["StripOffsets", "Image data location"],
		0x0116: ["RowsPerStrip", "Number of rows per strip"],
		0x0117: ["StripByteCounts", "Bytes per compression strip"],
		0x0201: ["JPEGInterchangeFormat", "Offset to JPEG SOI"],
		0x0202: ["JPEGInterchangeFormatLength", "Bytes of JPEG data"],

		//C. Tags relating to image data characteristics
		0x012D: ["TransferFunction", "Transfer function"],
		0x013E: ["WhitePoint", "White point chromaticity"],
		0x013F: ["PrimaryChromaticities", "Chromaticities of primaries"],
		0x0211: ["YCbCrCoefficients", "Color space transformation matrix coefficients"],
		0x0214: ["ReferenceBlackWhite", "Pair of black and white reference values"],

		//D. Other tags
		0x0132: ["DateTime", "File change date and time"],
		0x010E: ["ImageDescription", "Image title"],
		0x010F: ["Make", "Image input equipment manufacturer"],
		0x0110: ["Model", "Image input equipment model"],
		0x0131: ["Software", "Software used"],
		0x013B: ["Artist", "Person who created the image"],
		0x8298: ["Copyright", "Copyright holder"],

		0x8769: ["ExifIFDPointer", "Exif tag"],   //page 54
		0x8825: ["GPSInfoIFDPointer", "GPS tag"], //page 54
		0xA005: ["InteroperabilityIFDPointer", "Interoperability tag"] //page 55
	};

	//Table 4 Exif IFD Attribute Information - page 24
	Tags.Exif = {

		//A. Tags relating to Version
		0x9000: ["ExifVersion", "Exif version"],
		0xA000: ["FlashpixVersion", "Supported Flashpix version"],

		//B. Tag Relating to Image Data Characteristics
		0xA001: ["ColorSpace", "Color space information"],

		//C. Tags Relating to Image Configuration
		0x9101: ["ComponentsConfiguration", "Meaning of each component"],
		0x9102: ["CompressedBitsPerPixel", "Image compression mode"],
		0xA002: ["PixelXDimension", "Valid image width"],
		0xA003: ["PixelYDimension", "Valid image height"],

		//D. Tags Relaing to User Information
		0x927C: ["MakerNote", "Manufacturer notes"],
		0x9286: ["UserComment", "User comments"],

		//E. Tag Relating to Related File Information
		0xA004: ["RelatedSoundFile", "Related audio file"],

		//F. Tag Relating to Data and Time
		0x9003: ["DateTimeOriginal", "Date and time of original data generation"],
		0x9004: ["DateTimeDigitized", "Date and time of digital data generation"],
		0x9290: ["SubsecTime", "DateTime subseconds"],
		0x9291: ["SubsecTimeOriginal", "DateTimeOriginal subseconds"],
		0x9292: ["SubsecTimeDigitized", "DateTimeDigitized subseconds"],

		//G. Tags Relating to Picture-Taking Conditions
		//Table 5 Exif IFD Attribute Information - page 25
		0x829A: ["ExposureTime", "Exposure time"],
		0x829D: ["FNumber", "F number"],
		0x8822: ["ExposureProgram", "Exposure program"],
		0x8824: ["SpectralSensitivity", "Spectral sensitivity"],
		0x8827: ["ISOSpeedRatings", "ISO speed rating"],
		0x8828: ["OECF", "Optoelectric conversion factor"],
		0x9201: ["ShutterSpeedValue", "Shutter speed"],
		0x9202: ["ApertureValue", "Aperture"],
		0x9203: ["BrightnessValue", "Brightness"],
		0x9204: ["ExposureBiasValue", "Exposure bias"],
		0x9205: ["MaxApertureValue", "Maximum lens aperture"],
		0x9206: ["SubjectDistance", "Subject distance"],
		0x9207: ["MeteringMode", "Metering mode"],
		0x9208: ["LightSource", "Light source"],
		0x9209: ["Flash", "Flash"],
		0x920A: ["FocalLength", "Lens focal length"],
		0x9214: ["SubjectArea", "Subject area"],
		0xA20B: ["FlashEnergy", "Flash energy"],
		0xA20C: ["SpatialFrequencyResponse", "Spatial frequency response"],
		0xA20E: ["FocalPlaneXResolution", "Focal plane X resolution"],
		0xA20F: ["FocalPlaneYResolution", "Focal plane Y resolution"],
		0xA210: ["FocalPlaneResolutionUnit", "Focal plane resolution unit"],
		0xA214: ["SubjectLocation", "Subject location"],
		0xA215: ["ExposureIndex", "Exposure index"],
		0xA217: ["SensingMethod", "Sensing method"],
		0xA300: ["FileSource", "File source"],
		0xA301: ["SceneType", "Scene type"],
		0xA302: ["CFAPattern", "CFA pattern"],
		0xA401: ["CustomRendered", "Custom image processing"],
		0xA402: ["ExposureMode", "Exposure mode"],
		0xA403: ["WhiteBalance", "White balance"],
		0xA404: ["DigitalZoomRation", "Digital zoom ratio"],
		0xA405: ["FocalLengthIn35mmFilm", "Focal length in 35 mm film"],
		0xA406: ["SceneCaptureType", "Scene capture type"],
		0xA407: ["GainControl", "Gain control"],
		0xA408: ["Contrast", "Contrast"],
		0xA409: ["Saturation", "Saturation"],
		0xA40A: ["Sharpness", "Sharpness"],
		0xA40B: ["DeviceSettingDescription", "Device settings description"],
		0xA40C: ["SubjectDistanceRange", "Subject distance range"],

		//H. Other Tags
		0xA420: ["ImageUniqueID", "Unique image ID"]
	};

	//Table 12 GPS Attribute Information - page 46
	Tags.GPS = {

		//A. Tags Relating to GPS
		0x0000: ["GPSVersionID", "GPS tag version"],
		0x0001: ["GPSLatitudeRef", "North or South Latitude"],
		0x0002: ["GPSLatitude", "Latitude"],
		0x0003: ["GPSLongitudeRef", "East or West Longitude"],
		0x0004: ["GPSLongitude", "Longitude"],
		0x0005: ["GPSAltitudeRef", "Altitude reference"],
		0x0006: ["GPSAltitude", "Altitude"],
		0x0007: ["GPSTimeStamp", "GPS time (atomic clock)"],
		0x0008: ["GPSSatellites", "GPS satellites used for measurement"],
		0x0009: ["GPSStatus", "GPS receiver status"],
		0x000A: ["GPSMeasureMode", "GPS measurement mode"],
		0x000B: ["GPSDOP", "Measurement precision"],
		0x000C: ["GPSSpeedRef", "Speed unit"],
		0x000D: ["GPSSpeed", "Speed of GPS receiver"],
		0x000E: ["GPSTrackRef", "Reference for direction of movement"],
		0x000F: ["GPSTrack", "Direction of movement"],
		0x0010: ["GPSImgDirectionRef", "Reference for direction of image"],
		0x0011: ["GPSImgDirection", "Direction of image"],
		0x0012: ["GPSMapDatum", "Geodetic survey data used"],
		0x0013: ["GPSDestLatitudeRef", "Reference for latitude of destination"],
		0x0014: ["GPSDestLatitude", "Latitude of destination"],
		0x0015: ["GPSDestLongitudeRef", "Reference for longitude of destination"],
		0x0016: ["GPSDestLongitude", "Longitude of destination"],
		0x0017: ["GPSDestBearingRef", "Reference for bearing of destination"],
		0x0018: ["GPSDestBearing", "Bearing of destination"],
		0x0019: ["GPSDestDistanceRef", "Reference for distance to destination"],
		0x001A: ["GPSDestDistance", "Distance to destination"],
		0x001B: ["GPSProcessingMethod", "Name of GPS processing method"],
		0x001C: ["GPSAreaInformation", "Name of GPS area"],
		0x001D: ["GPSDateStamp", "GPS date"],
		0x001E: ["GPSDifferential", "GPS differential correction"]
	};

	//Table 18 Marker Segments - page 58
	var Marker = {
		SOI: 0xFFD8, //Start of Image (Start of compressed data)
		APP0: 0xFFE0, //Application Segment 0 (Jpeg attribute information)
		APP1: 0xFFE1, //Application Segment 1 (Exif attribute information)
		APP2: 0xFFE2, //Application Segment 2  (Exif extended data)
		DQT: 0xFFDB, //Define Quantization Table (Quantization table definition)
		DHT: 0xFFC4, //Define Huffman Table (Huffman table definition)
		DRI: 0xFFDD, //Define Restart Interoperability (Restart Interoperability definition)
		SOF: 0xFFC0, //Start of Frame (Parameter data relating to frame)
		SOF0: 0xFFC0, //Start of Frame (Parameter data relating to frame - Baseline DCT)
		SOF2: 0xFFC2, //Start of Frame (Parameter data relating to frame - Progressive DCT)
		SOS: 0xFFDA, //Start of Scan (Parameters relating to components)
		EOI: 0xFFD9  //End of Image (End of compressed data)
	};

	//Table 1 TIFF Headers - page 10
	var ByteOrder = {
		LittleEndian: 0x4949,
		BigEndian: 0x4D4D
	};

	//http://partners.adobe.com/public/developer/en/tiff/TIFF6.pdf - page 15/16
	var DataType = {
		UNSIGNED_CHAR: 1, //byte
		STRING: 2, //ascii
		UNSIGNED_SHORT: 3, //short
		UNSIGNED_INT: 4, //long
		UNSIGNED_RATIONAL: 5, //rational
		CHAR: 6, //sbyte
		UNDEFINED: 7, //undefined
		SHORT: 8, //sshort
		INT: 9, //slong
		RATIONAL: 10, //srational
		FLOAT: 11, //float
		DOUBLE: 12  //double
	};


	var Errors = {
		//Exif.parse
		IMAGE_WITHOUT_VALID_SRC: "Exif.parse: Image element with empty src",
		DOWNLOAD_FAILED: "Exif.parse: download failed",

		//Exif.Reader
		NOT_A_JPEG: "Exif.parser: Not a jpeg file",
		NO_EXIF_FOUND: "Exif.parser: No Exif tags found",
		CORRUPTED_TIFF_HEADER_BYTE_ORDER: "Exif.parser: corrupted TIFF header [byte order]",
		CORRUPTED_TIFF_HEADER_42: "Exif.parser: corrupted TIFF header [42]",

		UNKNOWN: "Exif.parser: unknown error"
	};

	/*
		ExifInfo class
		--------------
		.hasGPS()
		.getGPSCoord()
		.toJSON(withDescription)
	*/

	function ExifInfo(tags) {

		var _that = this;
		this.tags = tags;

		this.hasCapturedDate = function() {
			return _that.tags.Datetime || (_that.tags.Exif && _that.tags.Exif.DateTimeOriginal);
		};

		this.getCapturedDate = function() {
			if (!_that.hasCapturedDate()) {
				return new Date();
			}
			else if (_that.tags.Exif && _that.tags.Exif.DateTimeOriginal) {
				//Exif.DateTimeOriginal available
				var string = _that.tags.Exif.DateTimeOriginal.value;
				return parseExifDateString(string);
			}
			else {
				//Tiff.Datetime available
				var string = _that.tags.DateTime.value;
				return parseExifDateString(string);
			}
		};

		this.hasGPS = function () {
			return _that.tags.GPS && _that.tags.GPS.GPSLatitude && _that.tags.GPS.GPSLongitude;
		};

		this.hasThumbnail = function () {
			return _that.tags.Thumbnail && _that.tags.Thumbnail.blob;
		};

		this.getTag = function (name) {
			if (_that.tags && _that.tags[name]) {
				return _that.tags[name];
			}
			else if (_that.tags.GPS && _that.tags.GPS[name]) {
				return _that.tags.GPS[name];
			}
			else if (_that.tags.Exif && _that.tags.Exif[name]) {
				return _that.tags.Exif[name];
			}
			else {
				return;
			}
		};

		this.getGPSCoord = function () {
			if (_that.hasGPS()) {
				var gps = _that.tags.GPS;
				var lat = gps.GPSLatitude.value;
				var lng = gps.GPSLongitude.value;
				var strLatRef = gps.GPSLatitudeRef.value  || "N";
				var strLngRef = gps.GPSLongitudeRef.value || "W";

				return {
					latitude: (lat[0] + lat[1] / 60 + lat[2] / 3600) * (strLatRef === "N" ? 1 : -1),
					longitude: (lng[0] + lng[1] / 60 + lng[2] / 3600) * (strLngRef === "W" ? -1 : 1)
				};
			}
			else {
				return {};
			}
		};

		this.getThumbnailBlob = function () {
			return _that.tags.Thumbnail.blob;
		};

		this.toJSON = function (withDescription) {
			return recursiveToJson(_that.tags, withDescription, Tags.Tiff);
		};

		function recursiveToJson(tags, withDescription, referenceTags) {
			var folder = ["Exif", "GPS", "Thumbnail"];
			var json = {};
			for (var t in tags) {
				if (tags.hasOwnProperty(t)) {
					var tag = tags[t];
					if (typeof tag === "object" && folder.indexOf(t) === -1) {
						json[t] = withDescription ? [tag.value, referenceTags[tag.tag][1]] : tag.value;
					}
					else if (t === "Exif") {
						json.Exif = recursiveToJson(tag, withDescription, Tags.Exif, {});
					}
					else if (t === "GPS") {
						json.GPS = recursiveToJson(tag, withDescription, Tags.GPS, {});
					}
					else if (t === "Thumbnail") {
						json.Thumbnail = recursiveToJson(tag, withDescription, Tags.Tiff, {});
					}
				}
			}
			return json;
		}

		function parseExifDateString(string) {

			var date = new Date();

			//YYYY:MM:DD HH:MM:SS (sorry about this ugly parsing code :-( )

			var tmp = string.split(" ");
			if (tmp.length === 2) {

				var dateTmp = tmp[0].split(":");
				var timeTmp = tmp[1].split(":");

				if (dateTmp.length === 3 && timeTmp.length === 3) {

					date.setFullYear(parseInt(dateTmp[0], 10));
					date.setMonth(parseInt(dateTmp[1], 10)-1);
					date.setDate(parseInt(dateTmp[2], 10));

					date.setHours(parseInt(timeTmp[0], 10));
					date.setMinutes(parseInt(timeTmp[1], 10));
					date.setSeconds(parseInt(timeTmp[2], 10));
				}
			}

			return date;
		}

	}

	function JfifInfo() {
		this.versionMajor = null;
		this.versionMinor = null;
		this.units = null;
		this.xDensity = null;
		this.yDensity = null;
		this.thumbnailW = null;
		this.thumbnailH = null;
		this.thumbnailData = null;

		this.hasThumbnail = function () {
			return this.thumbnailW !== 0 && this.thumbnailH !== 0;
		};

		this.getVersion = function () {
			return this.versionMajor + "." + this.versionMinor;
		};

		this.getThumbnail = function () {
			//TODO: implement this.
		};
	}

	function TiffHeader(headerOffset, ifdOffset) {
		this.headerOffset = headerOffset;
		this.ifdOffset = ifdOffset;
	}

	function getExifText(data, offset, length) {
		return data.getString(offset, length - 1).replace("\x00", ""); //0x00 is used as padding and string are NULL terminated;
	}

	//Reader class
	function Reader(array, options) {

		var _options = options || {};
		var _onError = _options.onError || function () { };
		var _onUnknownTagFound = _options.onUnknownTagFound || function () { };
		var _onParsed = _options.onParsed || function () { };
		var _verboseLog = _options.verboseLog || false;

		read(array);

		//See page 9
		function read(arrayBuffer) {
			var data = new BinaryReader(arrayBuffer, false);
			var marker = data.getUint16();

			if (marker === Marker.SOI) {
				marker = data.getUint16();

				//stopping reading at the quantization table
				while (!data.eof()) {
					var length = data.getUint16() - 2; //read length (which include the length store as unsigned short -> -2)
					if (marker === Marker.APP0) {
						//http://www.jpeg.org/public/jfif.pdf - page 5
						var seekPosition = data.tell();
						var string = getExifText(data, data.tell(), 5);
						data.seek(data.tell() + 5);
						if (string === "JFIF") {
							//console.log("JFIF chunk");
							var info = new JfifInfo();
							info.versionMajor = data.getUint8();
							info.versionMinor = data.getUint8();
							info.units = data.getUint8();
							info.xDensity = data.getUint16();
							info.yDensity = data.getUint16();
							info.thumbnailW = data.getUint8();
							info.thumbnailH = data.getUint8();
							//TODO: read thumbnail data (if available)
						}
						else if (string === "JFXX") {
							//console.log("JFXX length: " + length);
						}
						else {
							//console.log("APP0 chunk");
						}
						data.seek(seekPosition + length);
					}
					else if (marker === Marker.APP1) {
						var seekPosition = data.tell();
						var string = getExifText(data, data.tell(), 6);
						data.seek(data.tell() + 6);
						if (string === "Exif") {
							//console.log("Exif chunk");
							var tiffHeader = parseTIFFHeader(data);

							//parsing Tiff IFD
							var tags = readTags(data, tiffHeader.headerOffset, tiffHeader.ifdOffset, Tags.Tiff, {});

							//parse Exif, GPS and thumbnail IFDs
							tags = parseOtherIFD(data, tiffHeader.headerOffset, tags);

							_onParsed(new ExifInfo(tags));
							return; //TODO: uncomment this
						}
						else {
							//console.log(string + " chunk");
						}
						data.seek(seekPosition + length);
					}
					else if (marker === Marker.APP2) {
						data.seek(data.tell() + length);
					}
					else if (marker === Marker.SOF0 || marker === Marker.SOF2) {
						//console.log("SOF");
						//console.log(data.getUint8());
						//console.log(data.getUint16());
						//console.log(data.getUint16());
						//console.log(data.getUint8());
						//data.seek(data.tell()+length);
						_onError(Errors.NO_EXIF_FOUND);
						return;
					}
					else {
						//console.log("marker: " + marker);
						data.seek(data.tell() + length);
					}
					marker = data.getUint16();
				}
				_onError(Errors.NO_EXIF_FOUND);
			}
			else {
				_onError(Errors.NOT_A_JPEG);
			}
		}

		//Table 1 TIFF Headers - page 10
		function parseTIFFHeader(data) {

			var tiffHeaderOffset = data.tell();

			//Byte Order (2 bytes)
			var byteOrder = data.getUint16();
			if (byteOrder === ByteOrder.LittleEndian) {
				data.setEndianness(true);
			}
			else if (byteOrder === ByteOrder.BigEndian) {
				data.setEndianness(false);
			}
			else {
				_onError(Errors.CORRUPTED_TIFF_HEADER_BYTE_ORDER);
				return;
			}

			//42 (2 bytes)
			var fortyTwo = data.getUint16();
			if (fortyTwo !== 42) {
				_onError(Errors.CORRUPTED_TIFF_HEADER_42);
				return;
			}

			//Offset of IFD (4 bytes)
			var ifdOffset = data.getUint32();

			return new TiffHeader(tiffHeaderOffset, ifdOffset);
		}

		function parseOtherIFD(data, tiffHeaderOffset, foundTags) {

			//parse Exif
			if (foundTags.ExifIFDPointer) {
				var pointer = foundTags.ExifIFDPointer.value;
				delete foundTags.ExifIFDPointer;
				foundTags.Exif = {};
				readTags(data, tiffHeaderOffset, pointer, Tags.Exif, foundTags.Exif);
			}

			//parse GPS
			if (foundTags.GPSInfoIFDPointer) {
				var pointer = foundTags.GPSInfoIFDPointer.value;
				delete foundTags.GPSInfoIFDPointer;
				var gps = foundTags.GPS = {};
				readTags(data, tiffHeaderOffset, pointer, Tags.GPS, gps);
			}

			//parse thumbnail
			if (foundTags.Thumbnail && foundTags.Thumbnail.JPEGInterchangeFormat && foundTags.Thumbnail.JPEGInterchangeFormatLength) {
				foundTags.Thumbnail.blob = data.getImage(tiffHeaderOffset + foundTags.Thumbnail.JPEGInterchangeFormat.value, foundTags.Thumbnail.JPEGInterchangeFormatLength.value);
				delete foundTags.Thumbnail.JPEGInterchangeFormat;
				delete foundTags.Thumbnail.JPEGInterchangeFormatLength;
			}

			return foundTags;
		}

		//See 4.6.2 IFD Structure - page 13
		function readTags(data, tiffHeaderOffset, ifdOffset, referenceTags, foundTags) {

			//2-byte count (number of fields)
			var numberOfFields = data.getUint16(tiffHeaderOffset + ifdOffset);

			var currentTags = {};
			if (_verboseLog) {
				console.log("Number of fields: " + numberOfFields);
			}

			//12-byte field Interoperability arrays
			for (var i = 0; i < numberOfFields; i++) {
				var fieldOffset = ifdOffset + 2 + 12 * i;
				var tag = data.getUint16(tiffHeaderOffset + fieldOffset);

				if (referenceTags[tag]) {
					var value = readTag(data, tiffHeaderOffset, fieldOffset);
					foundTags[referenceTags[tag][0]] = {
						'value': value,
						'tag': tag
					};
					if (_verboseLog) {
						currentTags[referenceTags[tag][0]] = {
							'value': value,
							'tag': tag

						};
					}
				}
				else { //Unknown tags
					var value = readTag(data, tiffHeaderOffset, fieldOffset);
					_onUnknownTagFound(tag, value);
				}
			}
			if (_verboseLog) {
				console.log(currentTags);
			}

			//4-byte offset to next IFD

			var nextIfdOffset = data.getUint32(tiffHeaderOffset + ifdOffset + 2 + 12 * numberOfFields);
			if (nextIfdOffset !== 0) { //next IFD = 0 if not present - page 9
				if (!foundTags.Thumbnail) {
					foundTags.Thumbnail = readTags(data, tiffHeaderOffset, nextIfdOffset, referenceTags, {});
				}
				else {
					readTags(data, tiffHeaderOffset, nextIfdOffset, referenceTags, foundTags);
				}
			}

			return foundTags;
		}

		function getBytesPerType(type) {
			switch (type) {
				case DataType.UNSIGNED_CHAR: return 1;
				case DataType.STRING: return 1;
				case DataType.UNSIGNED_SHORT: return 2;
				case DataType.UNSIGNED_INT: return 4;
				case DataType.UNSIGNED_RATIONAL: return 8;
				case DataType.CHAR: return 1;
				case DataType.UNDEFINED: return 1;
				case DataType.SHORT: return 2;
				case DataType.INT: return 4;
				case DataType.RATIONAL: return 8;
				case DataType.FLOAT: return 4;
				case DataType.DOUBLE: return 8;
				default: return 0;
			}
		}

		//See 4.6.2 IFD Structure - page 13
		function readTag(data, tiffHeaderOffset, fieldOffset) {

			data.seek(tiffHeaderOffset + fieldOffset + 2); //+2 as we already have read tag

			var type = data.getUint16();
			var count = data.getUint32();
			var bytesPerType = getBytesPerType(type);
			var nbBytes = count * bytesPerType;

			var valueoffset;
			if (nbBytes <= 4) { //the value is store in the field
				valueoffset = data.tell();
			}
			else { //the offset to the value is store in the field
				valueoffset = tiffHeaderOffset + data.getUint32();
			}
			return readTagValue(data, type, valueoffset, count, bytesPerType);
		}

		function readTagValue(data, type, valueoffset, count, bytesPerType) {

			//See page 14

			if (type === DataType.STRING || type === DataType.UNDEFINED) {
				return getExifText(data, valueoffset, count);
			}

			if (count !== 1) {
				var values = new Array(count);
				for (var i = 0; i < count; ++i) {
					values[i] = readTagValue(data, type, valueoffset + i * bytesPerType, 1, bytesPerType);
				}
				return values;
			}

			switch (type) {
				case DataType.UNSIGNED_CHAR:
					return data.getUint8(valueoffset);

					//case DataType.STRING is treated above

				case DataType.UNSIGNED_SHORT:
					return data.getUint16(valueoffset);
				case DataType.UNSIGNED_INT:
					return data.getUint32(valueoffset);
				case DataType.UNSIGNED_RATIONAL:
					var numerator = data.getUint32(valueoffset);
					var denonimator = data.getUint32(valueoffset + 4);
					return (denonimator === 0) ? 0 : numerator / denonimator;
				case DataType.CHAR:
					return data.getInt8(valueoffset);

					//case DataType.UNDEFINED is treated above

				case DataType.SHORT:
					return data.getInt16(valueoffset);
				case DataType.INT:
					return data.getInt32(valueoffset);
				case DataType.RATIONAL:
					var numerator = data.getInt32(valueoffset);
					var denonimator = data.getInt32(valueoffset + 4);
					return (denonimator === 0) ? 0 : numerator / denonimator;
				case DataType.FLOAT:
					return data.getFloat32(valueoffset);
				case DataType.DOUBLE:
					return data.getFloat64(valueoffset);
				default:
					return "Unknown type";
			}
			return 0;
		}
	}

	/*
			Exif.parse(input, options)
			input: can be an url, an HTMLImageElement, an Image element or an ArrayBuffer
			options: {
					onError(errorMessage),
					onParsed(exifInfo)
			}
	*/
	function parse(input, opt) {
		var options = opt || {};
		var onError = options.onError || function () { };

		var url;
		if (typeof input === "string") { //url
			url = input;
		}
		else if (typeof input === "object") {
			var constructor = input.constructor.toString();
			if (constructor.indexOf("HTMLImageElement") !== -1 || input instanceof Image) { //Image
				url = input.src;
				if (!url) {
					onError(Errors.IMAGE_WITHOUT_VALID_SRC);
					return;
				}
			}
			else if (constructor.indexOf("ArrayBuffer") !== -1) { //ArrayBuffer
				return parseArray(input, opt);
			}
			else {
				onError(Errors.UNKNOWN_INPUT_TYPE); //UNKNOWN_INPUT_TYPE: "Exif.parse: Unknown input type"
				return;
			}
		}
		else {
			onError(Errors.UNKNOWN_INPUT_TYPE);
			return;
		}

		if (url) {
			load(url, {
				onComplete: function (array) {
					parseArray(array, opt);
				},
				onError: function () {
					onError(Errors.DOWNLOAD_FAILED); //
				}
			});
		}
	}

	function parseArray(array, opt) {
		var options = opt || {};
		var onError = options.onError || function () { };

		try {
			new Reader(array, opt);
		}
		catch (err) {
			onError(err);
		}
	}

	//partial binary downloading
	function load(url, opt) {

		var options = opt || {};
		var onComplete = options.onComplete || function () { };
		var onError = options.onError || function () { };

		new Request(url, {
			responseType: "arraybuffer",
			headers: [{ name: "Range", value: "bytes=0-131072" }], //limit the download to the first 128k
			onComplete: function (xhr) {
				onComplete(xhr.response);
			},
			onError: function (xhr) {
				onError(xhr);
			}
		});
	}

	function isJpeg(arrayBuffer) {
		var data = new BinaryReader(arrayBuffer, false);
		var marker = data.getUint16();

		return marker === Marker.SOI;
	}

	return {
		revision: revision,
		parse: parse,
		BinaryReader: BinaryReader,
		Request: Request,
		Errors: Errors,
		isJpeg: isJpeg
	};
})();
