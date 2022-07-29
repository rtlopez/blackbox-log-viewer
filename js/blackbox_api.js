"use strict";

function BlackboxApi(flightLog, userSettings) {

    var fields = [];

    function BlackboxInterface() {

        this.add = function(config) {
            if(config.field && config.process) {
                fields.push(config);
            }
        };

        this.getValue = function(frame, fieldName) {
            var i = flightLog.getMainFieldIndexByName(fieldName);
            return frame[i] !== undefined ? frame[i] : 0;
        };

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
            var k = 1, result = 0;
            var _initPT1 = function() {
                // flightLog object is not yet complete, we must postpone initialisation
                var dT = _getSampleTimeUs() * 0.000001;
                var RC = 1 / (2 * Math.PI * cutFreq);
                k = dT / (RC + dT);
                result = 0;
                console.log(1/dT);
            };
            return function(v) {
                if(_initPT1) { _initPT1(); _initPT1 = null; }
                return result += k * (v - result);
            };
        };

        var BiquadType = {
            LPF:   'LPF',
            NOTCH: 'NOTCH',
            BPF:   'BPF'
        };

        function biquadReset(state) {
            // zero initial samples
            state.x1 = state.x2 = 0;
            state.y1 = state.y2 = 0;
        }

        function biquadInit(state, type, freq, q) {
            var rate = 1000000 / _getSampleTimeUs();
            var omega = 2 * Math.PI * freq / rate;
            var sn = Math.sin(omega);
            var cs = Math.cos(omega);
            var alpha = sn / (2 * q);
            var b0 = 0, b1 = 0, b2 = 0, a0 = 0, a1 = 0, a2 = 0;
            switch (type)
            {
                case BiquadType.LPF:
                    b0 = (1 - cs) * 0.5;
                    b1 =  1 - cs;
                    b2 = (1 - cs) * 0.5;
                    a0 =  1 + alpha;
                    a1 = -2 * cs;
                    a2 =  1 - alpha;
                    break;
                case BiquadType.NOTCH:
                    b0 =  1;
                    b1 = -2 * cs;
                    b2 =  1;
                    a0 =  1 + alpha;
                    a1 = -2 * cs;
                    a2 =  1 - alpha;
                    break;
                case BiquadType.BPF:
                    b0 =  alpha;
                    b1 =  0;
                    b2 = -alpha;
                    a0 =  1 + alpha;
                    a1 = -2 * cs;
                    a2 =  1 - alpha;
                    break;
            }

            // precompute the coefficients
            state.b0 = b0 / a0;
            state.b1 = b1 / a0;
            state.b2 = b2 / a0;
            state.a1 = a1 / a0;
            state.a2 = a2 / a0;
        }

        function biquadNotchQ(cutoff, freq) {
            var octaves = Math.log2 ? (Math.log2(freq  / cutoff) * 2) : (Math.log(freq  / cutoff) * Math.LOG2E * 2);
            return Math.sqrt(Math.pow(2, octaves)) / (Math.pow(2, octaves) - 1);
        }

        function biquadUpdateDF2(state, v) {
            var result = state.b0 * v + state.x1;
            state.x1 = state.b1 * v - state.a1 * result + state.x2;
            state.x2 = state.b2 * v - state.a2 * result;
            return result;
        }

        function biquadUpdateDF1(state, v) {
            var result = state.b0 * v + state.b1 * state.x1 + state.b2 * state.x2 - state.a1 * state.y1 - state.a2 * state.y2;
            state.x2 = state.x1; state.x1 = v;
            state.y2 = state.y1; state.y1 = result;
            return result;
        }

        this.createFilterBiquadLPF = function(cutFreq) {
            var state = {};
            var _initBiquadLPF = function() {
                var q = 1 / Math.sqrt(2);
                biquadReset(state);
                biquadInit(state, BiquadType.LPF, cutFreq, q);
            };
            return function(v) {
                if(_initBiquadLPF) { _initBiquadLPF(); _initBiquadLPF = null; }
                return biquadUpdateDF2(state, v);
            }
        };

        this.createFilterBiquadNotch = function(cutFreq, centerFreq) {
            var state = {};
            var _initBiquadNotch = function() {
                var q = biquadNotchQ(cutFreq, centerFreq);
                biquadReset(state);
                biquadInit(state, BiquadType.NOTCH, centerFreq, q);
            };
            return function(v) {
                if(_initBiquadNotch) { _initBiquadNotch(); _initBiquadNotch = null; }
                return biquadUpdateDF2(state, v);
            }
        };

        this.createFilterBiquadBPF = function(cutFreq, centerFreq) {
            var state = {};
            var _initBiquadBPF = function() {
                var q = biquadNotchQ(cutFreq, centerFreq);
                biquadReset(state);
                biquadInit(state, BiquadType.BPF, centerFreq, q);
            };
            return function(v) {
                if(_initBiquadBPF) { _initBiquadBPF(); _initBiquadBPF = null; }
                return biquadUpdateDF2(state, v);
            }
        };
    }

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
        _run();
        $.each(fields, function(i, field) {
            fieldNames.push(field.field);
        });
    };

    this.injectFieldValues = function(fieldIndex, destFrame, srcFrame) {
        $.each(fields, function(i, field) {
            destFrame[fieldIndex++] = field.process(srcFrame);
        });
    };

    function _getSampleTimeUs() {
        var sc = flightLog.getSysConfig();
        var sampleTimeUs = 1000;
        if(sc.looptime && sc.frameIntervalPDenom && sc.frameIntervalPNum) {
            sampleTimeUs = sc.looptime;
            sampleTimeUs *= Math.max(sc.pid_process_denom, 1);
            sampleTimeUs *= sc.frameIntervalPDenom;
            sampleTimeUs /= sc.frameIntervalPNum;
        } else if(sc.frameIntervalI) {
            sampleTimeUs *= 32;
            sampleTimeUs /= sc.frameIntervalI; // not sure if correct
        }
        return sampleTimeUs;
    }

    function _run() {
        var code = '"use strict";\n' + userSettings.script.content + ';\n';
        try {
            (new Function('blackbox', code))(new BlackboxInterface());
        } catch(e) {
            fields = []; // clean configuration, it might be incomplete
            console.log(e);
            alert('Syntax error in user script code: ' + e.message);
        }
    }
}