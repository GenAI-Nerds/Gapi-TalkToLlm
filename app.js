
// HARDCODE THE FOLLOWING 4 if you like else enter them in html widgets
var url = "";//"ws://localhost:8090/gapi-ws"
var gapiKey = "CFCFA7DBA228";
var workflowKey = "8DBA42055F8D";
var microServiceKey = "";
var sttNodeKey = "B1F50A586DCF";

var mediaPlayer;
var workflowMode = "idle";
var mode = "init";
var ws;

var isProcessing = false;

var messageTimer;
var retryConnectTime = 6000;
var messageInterval = 60000;

var audioContext;
var streamInProcess;
var sampleRate;
var audioInput;
var recordder;
var outputSampleRate = 16000;
var playbackSampleRate = 44100;

var textEncoder = new TextEncoder();
var headerBytes;
var jsonBytes;

var startedMode = false;

function onLoad() {

}

function encodeMicroServiceMsg(binBytesArrayBuffer) {
    
  console.log("Encoding");

  var idx = 0;  
  if (!headerBytes) {
      
    var msm = {
      "workflowKey": workflowKey,
      "nodeKey": sttNodeKey,
      "microServiceKey": microServiceKey,
      "destination": "microService",
      "message": "{\"loudnessThreshold\": -7}"
    }
  
    headerBytes = new ArrayBuffer(8); //4 bytes magic plus 4 bytes jsonLen
    var view = new DataView(headerBytes);
    view.setUint8(idx++, 20); //magic
    view.setUint8(idx++, 10);
    view.setUint8(idx++, 5);
    view.setUint8(idx++, 17);
    
    var msmAsJson = JSON.stringify(msm);
    var jsonLen = msmAsJson.length;
    view.setUint32(idx, jsonLen, true); // true = little endian
    idx += 4;
    
    jsonBytes = textEncoder.encode(msmAsJson);
  }
  else {
    idx = 8;
  }
  
  // Concat 4 bytes magic plus jsonLen plus json as bytes plus binary bytes
  var outBytesLen = idx + jsonBytes.length + binBytesArrayBuffer.byteLength;
  var outBytes = new Uint8Array(outBytesLen);
  outBytes.set(new Uint8Array(headerBytes), 0); // header
  outBytes.set(jsonBytes, idx);
  
  idx += jsonBytes.length;
  
  if (binBytesArrayBuffer.byteLength > 0) {
      
    outBytes.set(new Uint8Array(binBytesArrayBuffer), idx);
  }

  return outBytes;
}

function toggleFlow() {

  if (startedMode) {
  
    console.log("ToggleFlow: Stopped----------------->");  
    shutdown();
    startedMode = false;
    return;
  }
  
  startedMode = true;
  console.log("ToggleFlow: Started----------------->");  
  
  if (url.length == 0) {
   url = document.getElementById("gapiUrl").value;
  }

  if (gapiKey.length == 0) {
    gapiKey = document.getElementById("gapiKey").value;
  }

  if (workflowKey.length == 0) {
    workflowKey = document.getElementById("workflowKey").value;
  }

  if (sttNodeKey.length == 0) {
    sttNodeKey = document.getElementById("sttNodeKey").value;
  }

  if (microServiceKey.length == 0) {
    microServiceKey = document.getElementById("microServiceKey").value;
  }

  console.log("startFlow(), gapiKey: " + gapiKey + ", workflowKey: " + workflowKey + ", sttNodeKey: " + sttNodeKey + ", microServiceKey: " + microServiceKey);

  connect();
}

function connect() {

  ws = new WebSocket(url);
  ws.binaryType = "arraybuffer";

  ws.onopen = function() {

    console.log("Websocket: connected");

    startMessageTimer();
    mode = "sendStartSession";
    
    {
      let o = {
        key: gapiKey,
        apiServiceName: 'hello'
      }

      sendMsg(o);
    }

    {
      let o = {
        key: gapiKey,
        apiServiceName: 'watchWorkflow',
        workflowKey: workflowKey
      }

      sendMsg(o);
    }
    
    assertMediaPlayer();
    requestLocalAudio();
  };

  ws.onmessage = function (evt) { 

    var msg = evt.data;

    console.log("onMessage: " + msg);

    if (msg instanceof ArrayBuffer) {

      console.log("Got chunk playing------------>size: " + msg.byteLength);
      var dataArray = new Uint8Array(msg);
      mediaPlayer.feed(dataArray);
      return;
    }

    var o = JSON.parse(msg);
    if (o.data) {

      var response = JSON.parse(o.data);

      console.log("response: " + response);
    }

    if (mode == "sendStartSession") {

      mode = "receivedStartSessionAck";
      let o = {
        key: gapiKey,
        apiServiceName: "liveSpeechToText",
        action: "startApiSession",
        routeWorkflowKey: workflowKey,
        routeNodeKey: sttNodeKey
      }

      sendMsg(o);
    }
  };

  ws.onclose = function() { 

    console.log("[ERROR] Websocket: closed");
    stopMessageTimer();
    shutdown();
    setTimeout(connect, retryConnectTime);
  };

  ws.onerror = function(e) {

    console.log("Websocket: error: " + e.data);
  }
}

function assertMediaPlayer() {

  if (mediaPlayer) { return; }

  console.log("assertMediaPlayer()");

  mediaPlayer = new PCMPlayer({
    encoding: '16bitInt',
    channels: 1,
    sampleRate: playbackSampleRate,
    flushingTime: 25
  });
}

function PCMPlayer(t){this.init(t)}PCMPlayer.prototype.init=function(t){this.option=Object.assign({},{encoding:"16bitInt",channels:1,sampleRate:8e3,flushingTime:1e3},t),this.samples=new Float32Array,this.flush=this.flush.bind(this),this.interval=setInterval(this.flush,this.option.flushingTime),this.maxValue=this.getMaxValue(),this.typedArray=this.getTypedArray(),this.createContext()},PCMPlayer.prototype.getMaxValue=function(){var t={"8bitInt":128,"16bitInt":32768,"32bitInt":2147483648,"32bitFloat":1};return t[this.option.encoding]?t[this.option.encoding]:t["16bitInt"]},PCMPlayer.prototype.getTypedArray=function(){var t={"8bitInt":Int8Array,"16bitInt":Int16Array,"32bitInt":Int32Array,"32bitFloat":Float32Array};return t[this.option.encoding]?t[this.option.encoding]:t["16bitInt"]},PCMPlayer.prototype.createContext=function(){this.audioCtx=new(window.AudioContext||window.webkitAudioContext),this.gainNode=this.audioCtx.createGain(),this.gainNode.gain.value=1,this.gainNode.connect(this.audioCtx.destination),this.startTime=this.audioCtx.currentTime},PCMPlayer.prototype.isTypedArray=function(t){return t.byteLength&&t.buffer&&t.buffer.constructor==ArrayBuffer},PCMPlayer.prototype.feed=function(t){if(this.isTypedArray(t)){t=this.getFormatedValue(t);var e=new Float32Array(this.samples.length+t.length);e.set(this.samples,0),e.set(t,this.samples.length),this.samples=e}},PCMPlayer.prototype.getFormatedValue=function(t){t=new this.typedArray(t.buffer);var e,i=new Float32Array(t.length);for(e=0;e<t.length;e++)i[e]=t[e]/this.maxValue;return i},PCMPlayer.prototype.volume=function(t){this.gainNode.gain.value=t},PCMPlayer.prototype.destroy=function(){this.interval&&clearInterval(this.interval),this.samples=null,this.audioCtx.close(),this.audioCtx=null},PCMPlayer.prototype.flush=function(){if(this.samples.length){var t,e,i,n,a,s=this.audioCtx.createBufferSource(),r=this.samples.length/this.option.channels,o=this.audioCtx.createBuffer(this.option.channels,r,this.option.sampleRate);for(e=0;e<this.option.channels;e++)for(t=o.getChannelData(e),i=e,a=50,n=0;n<r;n++)t[n]=this.samples[i],n<50&&(t[n]=t[n]*n/50),r-51<=n&&(t[n]=t[n]*a--/50),i+=this.option.channels;this.startTime<this.audioCtx.currentTime&&(this.startTime=this.audioCtx.currentTime),console.log("start vs current "+this.startTime+" vs "+this.audioCtx.currentTime+" duration: "+o.duration),s.buffer=o,s.connect(this.gainNode),s.start(this.startTime),this.startTime+=o.duration,this.samples=new Float32Array}};

function startMessageTimer() {
    if (messageTimer) {
        clearInterval(messageTimer);
    }
    messageTimer = setInterval(function() {
        if (ws && ws.readyState === WebSocket.OPEN) {

            let o = {
              key: "",
              apiServiceName: "ping"
            }

            sendMsg(o);
        }
    }, messageInterval);
}

function stopMessageTimer() {
    if (messageTimer) {
        clearInterval(messageTimer);
        messageTimer = null;
    }
}

function sendMsg(o) {

  let asString = JSON.stringify(o);
  console.log("sendRequest: " + asString);
  ws.send(asString);
}

function sendRequest(obj) {

  sendMsg(obj);
}

/*
function sendStart() {

  console.log("startClick()");

  let dataObj = {
    speechText: "hello"
  }

  let o = {
    key: gapiKey,
    apiServiceName: "workflowInvoke",
    wfKey: workflowKey,
    nodeKey: sttNodeKey,
    data: dataObj
  }

  sendRequest(o);
}
*/

function requestLocalAudio() {

console.log("RequestLocalAudio...");
navigator.mediaDevices
  .getUserMedia({ audio: true, video: false })
  .then((stream) => {

    setupAudioStreams(stream);
    //this.resourceService.notifyUserAgentStartedMedia(); // to start background media player
  })
  .catch((err) => {
    console.log("Can't init audio: " + err);
  });
}

function setupAudioStreams(stream) {

  console.log("Setting up audio context");
  audioContext = new AudioContext();
  streamInProcess = stream;
  sampleRate = audioContext.sampleRate;
  console.log("Sample rate of local audio: " + sampleRate)
  
  audioInput = audioContext.createMediaStreamSource(stream);
  var bufferSize = 4096;
  var inputChannelCount = 1;
  var outputChannelCount = 1;
  recorder = audioContext.createScriptProcessor(bufferSize, inputChannelCount, outputChannelCount);
  startAudioRunnable();
}

function startAudioRunnable() {

  console.log("startRivaSession");
  if (!document) { return; }
      
  let elem = document.getElementById("audioWorker");
  if (!elem) {
    console.log("[ERROR] can't find audioworker");
    return;
  }

  let textContent = elem.textContent;
  // Blob based worker to do audio conversion in the background
  var blob = new Blob([
    textContent
  ], { type: "text/javascript" })

  // Note: window.webkitURL.createObjectURL() in Chrome 10+.
  let worker = new Worker(window.URL.createObjectURL(blob));

  worker.postMessage({
    command: 'init',
    config: {
      sampleRate: sampleRate,
      outputSampleRate: outputSampleRate
    }
  });

  // Use a worker thread to resample the audio, then send to server
  this.recorder.onaudioprocess = (audioProcessingEvent) => {

    let inputBuffer = audioProcessingEvent.inputBuffer;
    worker.postMessage({
      command: 'convert',
      // We only need the first channel
      buffer: inputBuffer.getChannelData(0)
    });

    worker.onmessage = (msg) =>{

      if (msg.data.command == 'newBuffer') {

        console.log("Audio bytes: " + msg.data.resampled.buffer.byteLength);
        var encoded = encodeMicroServiceMsg(msg.data.resampled.buffer);
        ws.send(encoded);
      }
    };
  };

  // connect stream to our recorder
  audioInput.connect(this.recorder);
  // connect our recorder to the previous destination
  recorder.connect(this.audioContext.destination);

  console.log("Audio pipeline setup OK");
}

function shutdown() {

  console.log("Shutting down audio pipeline");

  if (this.streamInProcess) {
    try {
      this.streamInProcess.getTracks().forEach((track) => {
        track.stop()
      });
    }
    catch (error) { console.error(error); }
  }
    
  if (this.audioInput) {
    try {
      this.audioInput.disconnect();
    }
    catch (error) { console.error(error); }
  }

  if (this.recorder) {
    try {
      this.recorder.disconnect();
    }
    catch (error) { console.error(error); }
  }
}