"use strict";

function BlackboxApi(flightLog, userSettings) {

    var fields = [];

    this.add = function(config) {
        if(config.field && config.process) {
            fields.push(config);
        }
    };

    this.exists = function(field) {
        for(var i in fields) {
            if(field == fields[i].field) return true;
        }
    };

    this.display = function(field) {
        for(var i in fields) {
            if(field == fields[i].field && fields[i].display) return fields[i].display;
        }
        return field;
    };

    this.getFieldCount = function() {
        return fields.length;
    };

    this.injectFieldNames = function(fieldNames) {
        for(var i in fields) {
            fieldNames.push(fields[i].field);
        }
    };

    this.injectFieldValues = function(fieldIndex, destFrame, srcFrame) {
        for(var i in fields) {
            destFrame[fieldIndex++] = fields[i].process(srcFrame);
        }
    };

    this.getValue = function(frame, fieldName) {
        var i = flightLog.getMainFieldIndexByName(fieldName);
        return frame[i] !== undefined ? frame[i] : 0;
    };

    function getSampleTime() {
        var sc = flightLog.getSysConfig();
        var sampleTimeUs = 1000;
        if(sc.looptime && sc.frameIntervalPDenom && sc.frameIntervalPNum) {
            sampleTimeUs = sc.looptime;
            sampleTimeUs *= sc.frameIntervalPDenom;
            sampleTimeUs /= sc.frameIntervalPNum;
        } else if(sc.frameIntervalI) {
            //sampleTimeUs *= (sc.frameIntervalI / 32);
            sampleTimeUs *= (32 / sc.frameIntervalI);
        }
        return sampleTimeUs;
    }

    this.createFilterPT1 = function(cutFreq) {
        // flightLog object is not yet complete, we must postpone initialisation
        var dT, RC, k, result;
        var initPt1 = function() {
            dT = getSampleTime() * 0.000001;
            RC = 1 / (2 * Math.PI * cutFreq);
            k = dT / (RC + dT);
            result = 0;
        };
        return function(v) {
            if(initPt1) { initPt1(); initPt1 = null; }
            return result += k * (v - result);
        };
    };

    this.createFilterFIR2 = function(cutFreq) {
        var prev = 0;
        return function(v) {
            var result = (prev + v) * 0.5;
            prev = v;
            return result;
        };
    };

    function run(blackbox) {
        var content = userSettings.script.content;
        var code = '(function(){\n"use strict";\n' + content + '\n})();';
        try {
            eval(code);
        } catch(e) {
            fields = []; // clean configuration, it might be incomplete
            console.log(e);
        }
    }
    run(this);
}