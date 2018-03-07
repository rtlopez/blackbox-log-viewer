"use strict";

function BlackboxApi(flightLog, userSettings) {

    var fields = [];

    function _run(blackbox) {
        var code = '"use strict";\n' + userSettings.script.content + ';\n';
        //console.log(code);
        try {
            (new Function('blackbox', code))(blackbox);
        } catch(e) {
            fields = []; // clean configuration, it might be incomplete
            console.log(e);
            alert('Syntax error in user script code');
        }
    }

    this.add = function(config) {
        if(config.field && config.process) {
            fields.push(config);
        }
    };

    this.exists = function(fieldName) {
        for(var i in fields) {
            if(fieldName == fields[i].field) return true;
        }
        return false;
    };

    this.display = function(fieldName) {
        for(var i in fields) {
            if(fieldName == fields[i].field && fields[i].display) return fields[i].display;
        }
        return fieldName;
    };

    this.getFieldCount = function() {
        return fields.length;
    };

    this.injectFieldNames = function(fieldNames) {
        _run(this);
        $.each(fields, function(i, field) {
            fieldNames.push(field.field);
        });
    };

    this.injectFieldValues = function(fieldIndex, destFrame, srcFrame) {
        $.each(fields, function(i, field) {
            destFrame[fieldIndex++] = field.process(srcFrame);
        });
    };

    this.getValue = function(frame, fieldName) {
        var i = flightLog.getMainFieldIndexByName(fieldName);
        return frame[i] !== undefined ? frame[i] : 0;
    };

    function _getSampleTimeUs() {
        var sc = flightLog.getSysConfig();
        var sampleTimeUs = 1000;
        if(sc.looptime && sc.frameIntervalPDenom && sc.frameIntervalPNum) {
            sampleTimeUs = sc.looptime;
            sampleTimeUs *= sc.gyro_sync_denom;
            sampleTimeUs *= sc.frameIntervalPDenom;
            sampleTimeUs /= sc.frameIntervalPNum;
        } else if(sc.frameIntervalI) {
            sampleTimeUs *= 32;
            sampleTimeUs /= sc.frameIntervalI; // not sure if correct
        }
        return sampleTimeUs;
    }

    this.createFilterNull = function() {
        return function(v) {
            return v;
        }
    };

    this.createFilterFIR2 = function(cutFreq) {
        var prev = 0;
        return function(v) {
            var result = (prev + v) * 0.5;
            prev = v;
            return result;
        };
    };

    this.createFilterPT1 = function(cutFreq) {
        var dT, RC, k, result;
        var _initPT1 = function() {
            // flightLog object is not yet complete, we must postpone initialisation
            dT = _getSampleTimeUs() * 0.000001;
            RC = 1 / (2 * Math.PI * cutFreq);
            k = dT / (RC + dT);
            result = 0;
            console.log(1/dT);
        };
        return function(v) {
            if(_initPT1) { _initPT1(); _initPT1 = null; }
            return result += k * (v - result);
        };
    };

    this.createFilterBiquadLPF = function(cutFreq) {
        return function(v) {
            return v;
        }
    };

    this.createFilterBiquadNotch = function(cutFreq, centerFreq) {
        return function(v) {
            return v;
        }
    };

    this.createFilterBiquadBPF = function(cutFreq, centerFreq) {
        return function(v) {
            return v;
        }
    };
}