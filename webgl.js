var cubeRotation = 0.0;
var webSocket = null;

var gl = null;
var mvMatrix = mat4.create();
var projMatrix = mat4.create();
var stats = null;
var g_lastSentTimestamp = 0;
var g_lastReceivedTimestamp = 0;
var g_lastRenderedTimestamp = 0;
var g_latencyDirty = false;

var g_vertexBuffer;
var g_indexBuffer;
var g_indexCount = 0;
const g_sizeofPos = 3*4;
const g_sizeofNrm = 3*4;
const g_sizeofCol = 1*4;
const g_sizeofVertex = g_sizeofPos+g_sizeofNrm+g_sizeofCol;

main();

function showCube()
{
  if(webSocket.readyState == WebSocket.OPEN) {
    webSocket.send("cube");
  }
}

function showTetra()
{
  if(webSocket.readyState == WebSocket.OPEN) {
    webSocket.send("tetra");
  }
}

function connectSocket(addr)
{
  console.log("connecting to " + addr);
  
  if (webSocket)
    webSocket.close();
  
  webSocket = new WebSocket(addr);
  webSocket.binaryType = 'arraybuffer';
  webSocket.onmessage = function(event) {
    
    var buff = new Uint8Array(event.data).buffer;
    var view = new DataView(buff);
    var offset = 0;
    const nID = view.getInt32(offset, true); offset += 4;
    offset += 4; // pad
    g_lastReceivedTimestamp = Number(view.getBigUint64(offset, true)); offset += 8;
    const serverTimestamp1 = Number(view.getBigUint64(offset, true)); offset += 8;
    const serverTimestamp2 = Number(view.getBigUint64(offset, true)); offset += 8;
    g_latencyDirty = true;

    {
      const timeNow = (new Date()).getTime();
      document.getElementById("cs-latency").innerHTML = "Client->Server Network Latency: " + (serverTimestamp1 - g_lastReceivedTimestamp) + "ms";
      document.getElementById("server-latency").innerHTML = "Server Processing Time: " + (serverTimestamp2 - serverTimestamp1) + "ms";
      document.getElementById("net-latency").innerHTML = "Round-trip Latency: " + (timeNow - g_lastReceivedTimestamp) + "ms";
    }

    if (nID==0) { // replace all mesh data
      webSocket.send("got");
    
      const nPos = view.getInt32(offset, true); offset += 4;
      const nIdx = view.getInt32(offset, true); offset += 4;
      
      if (!g_vertexBuffer)
        g_vertexBuffer = gl.createBuffer();
      if (nPos) {
        gl.bindBuffer(gl.ARRAY_BUFFER, g_vertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Uint8Array(event.data, offset, nPos*g_sizeofVertex), gl.STATIC_DRAW);
        offset += nPos*g_sizeofVertex;
      }
      
      if (!g_indexBuffer)
        g_indexBuffer = gl.createBuffer();
      if (nIdx) {
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, g_indexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(event.data, offset, nIdx), gl.STATIC_DRAW);
        offset += nIdx*4;
      }
      
      g_indexCount = nIdx;
    }
    else if (nID==1) {  // replace view matrix
      for (let i=0; i<16; i++) {
        mvMatrix[i] = view.getFloat32(offset, true);
        offset += 4;
      }
    }
    else if (nID==2) { // replace proj matrix
      for (let i=0; i<16; i++) {
        projMatrix[i] = view.getFloat32(offset, true);
        offset += 4;
      }
    }
    else if (nID==3) {  // replace a region of the mesh data
      webSocket.send("gotregion");
    
      const nVertexOffset = view.getInt32(offset, true); offset += 4;
      const nVertexCount = view.getInt32(offset, true); offset += 4;
      const nIndexOffset = view.getInt32(offset, true); offset += 4;
      const nIndexCount = view.getInt32(offset, true); offset += 4;
      
      if (nVertexCount && g_vertexBuffer) {
        gl.bindBuffer(gl.ARRAY_BUFFER, g_vertexBuffer);
        gl.bufferSubData(gl.ARRAY_BUFFER, nVertexOffset*g_sizeofVertex, new Uint8Array(event.data, offset, nVertexCount*g_sizeofVertex));
        offset += nVertexCount*g_sizeofVertex;
      }
      
      if (nIndexCount && g_indexBuffer) {
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, g_indexBuffer);
        gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, nIndexOffset*4, new Uint8Array(event.data, offset, nIndexCount*4));
        offset += nIndexCount*4;
      }
    }
  }
}

function initInput()
{
  class InputEvent {
    constructor(type) {
      this.timestamp = (new Date()).getTime();
      this.keycode = 0;
      this.x = 0;
      this.y = 0;
      this.type = type;
      this.down = 0;

      g_lastSentTimestamp = this.timestamp;
    }
  }

  const mouseButtonToVTRMOUSEBUTTON = new Map([
    [0, 0],
    [1, 2],
    [2, 1]
  ]);

  function sendInputEvent(inputEvent) {
    if(webSocket.readyState == WebSocket.OPEN) {
      let payload = new ArrayBuffer(24);
      let view = new DataView(payload);
      view.setBigUint64(0, BigInt(inputEvent.timestamp), true);
      view.setUint32(8, inputEvent.keycode, true);
      view.setInt16(12, inputEvent.x, true);
      view.setInt16(14, inputEvent.y, true);
      view.setUint8(16, inputEvent.type, true);
      view.setUint8(17, inputEvent.down, true);
      webSocket.send(payload);
    }
  }

  document.addEventListener('keydown', e => { 
    let ie = new InputEvent(0);
    ie.keycode = e.keyCode;
    ie.down = 1;
    sendInputEvent(ie);
  }, false);
  document.addEventListener('keyup', e => {
    let ie = new InputEvent(0);
    ie.keycode = e.keyCode;
    ie.down = 0;
    sendInputEvent(ie);
  }, false);
  document.addEventListener('mousedown', e => { 
    let ie = new InputEvent(1);
    ie.keycode = mouseButtonToVTRMOUSEBUTTON.get(e.button);
    ie.x = e.clientX;
    ie.y = e.clientY;
    ie.down = 1;
    sendInputEvent(ie);
  }, false);
  document.addEventListener('mouseup', e => { 
    let ie = new InputEvent(1);
    ie.keycode = mouseButtonToVTRMOUSEBUTTON.get(e.button);
    ie.x = e.clientX;
    ie.y = e.clientY;
    ie.down = 0;
    sendInputEvent(ie);
  }, false);
  document.addEventListener('mousemove', e => {
    let ie = new InputEvent(2);
    ie.x = e.clientX;
    ie.y = e.clientY;
    sendInputEvent(ie);
  }, false);
  document.addEventListener('wheel', e => {
    let ie = new InputEvent(3);
    ie.y = -e.deltaY;
    sendInputEvent(ie);
  }, false);

  // block right clicks bringing up a context menu
  document.oncontextmenu = e => { return false; };
}

//
// Start here
//
function main() {

  stats = new Stats();
  stats.showPanel( 0 );
  document.body.appendChild( stats.dom );
  
  const canvas = document.querySelector('#glcanvas');
  gl = canvas.getContext('webgl');
  
  // If we don't have a GL context, give up now
  if (!gl) {
    alert('Unable to initialize WebGL. Your browser or machine may not support it.');
    return;
  }
  
  var uints_for_indices = gl.getExtension("OES_element_index_uint");
  if (!uints_for_indices) {
    alert('The WebGL used by your browser does not support 32bit indices, which we require to run.');
    return;
  }
  
  connectSocket("ws://localhost:9008");
  initInput();

  // Vertex shader program
  const vsSource = `
    precision highp float;
    attribute vec3 aVertexPosition;
    attribute vec3 aVertexNormal;
    attribute vec4 aVertexColour;

    uniform mat4 uModelViewMatrix;
    uniform mat4 uProjectionMatrix;

    varying vec3 vNormal;
    varying vec3 vView;
    varying lowp vec4 vAlbedo;

    void main() {
      gl_Position = uProjectionMatrix * uModelViewMatrix * vec4(aVertexPosition, 1.0);
      vNormal = aVertexNormal;
      vAlbedo = aVertexColour;
      
      vec3 viewPos = -uModelViewMatrix[3].xyz * mat3(uModelViewMatrix);
      vView = normalize(viewPos - aVertexPosition);
    }
  `;

  // Fragment shader program
  const fsSource = `
    precision highp float;
    varying vec3 vNormal;
    varying vec3 vView;
    varying lowp vec4 vAlbedo;
    
    vec3 N, V;
    
    vec3 light(vec3 lightColour, vec3 L) {
      vec3 H = normalize(L + V);
      vec3 diffuse = lightColour * max(dot(N, L), 0.0);
      vec3 specular = lightColour * pow(max(dot(N, H), 0.0), 64.0);
      return vAlbedo.rgb * diffuse + specular;
    }
  
    void main() {
      N = normalize(vNormal);
      V = normalize(vView);
      
      gl_FragColor.rgb = vec3(0.0);
      gl_FragColor.rgb += light(vec3(1.0, 1.0, 1.0), normalize(vec3(0.5, 1.0, 0.0)));
      gl_FragColor.rgb += light(vec3(0.2, 0.2, 0.0), normalize(vec3(-0.5, -1.0, 0.0)));
      
      gl_FragColor.rgb = pow(gl_FragColor.rgb, vec3(1.0/2.2));  // go from linear to gamma colour space for output
      gl_FragColor.a = vAlbedo.a;
    }
  `;

  // Initialize a shader program; this is where all the lighting
  // for the vertices and so forth is established.
  const shaderProgram = initShaderProgram(gl, vsSource, fsSource);

  // Collect all the info needed to use the shader program.
  // Look up which attribute our shader program is using
  // for aVertexPosition and look up uniform locations.
  const programInfo = {
    program: shaderProgram,
    attribLocations: {
      vertexPosition: gl.getAttribLocation(shaderProgram, 'aVertexPosition'),
      vertexNormal: gl.getAttribLocation(shaderProgram, 'aVertexNormal'),
      vertexColour: gl.getAttribLocation(shaderProgram, 'aVertexColour'),
    },
    uniformLocations: {
      projectionMatrix: gl.getUniformLocation(shaderProgram, 'uProjectionMatrix'),
      modelViewMatrix: gl.getUniformLocation(shaderProgram, 'uModelViewMatrix'),
    },
  };

  // Draw the scene repeatedly
  var then = 0;
  function render(now) {
    stats.begin();
    
    now *= 0.001;  // convert to seconds
    const deltaTime = now - then;
    then = now;
    cubeRotation += deltaTime;

    drawScene(gl, programInfo);
    
    stats.end();
  
    // Not sure when the GPU might have actually finished rendering...
    if(g_latencyDirty) {
      const timeNow = (new Date()).getTime();
      document.getElementById("render-latency").innerHTML = "Render Latency: " + (timeNow - g_lastReceivedTimestamp) + "ms";
      g_lastRenderedTimestamp = g_lastReceivedTimestamp;
      g_latencyDirty = false;
    }
    
    requestAnimationFrame(render);
  }
  requestAnimationFrame(render);
}

//
// Draw the scene.
//
function drawScene(gl, programInfo) {
  gl.clearColor(0.0, 0.0, 0.0, 1.0);  // Clear to black, fully opaque
  gl.clearDepth(1.0);                 // Clear everything
  gl.enable(gl.DEPTH_TEST);           // Enable depth testing
  gl.depthFunc(gl.LEQUAL);            // Near things obscure far things
  gl.disable(gl.CULL_FACE);
  
  // Clear the canvas before we start drawing on it.
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
                   
  // Tell WebGL to use our program when drawing
  gl.useProgram(programInfo.program);

  // Set the shader uniforms
  gl.uniformMatrix4fv(
      programInfo.uniformLocations.modelViewMatrix,
      false,
      mvMatrix);  
  gl.uniformMatrix4fv(
      programInfo.uniformLocations.projectionMatrix,
      false,
      projMatrix);

  if (g_indexCount && g_vertexBuffer && g_indexBuffer)
  {
    gl.bindBuffer(gl.ARRAY_BUFFER, g_vertexBuffer);
    
    const stride = g_sizeofVertex;
    offset = 0;
    
    gl.vertexAttribPointer(programInfo.attribLocations.vertexPosition, 3, gl.FLOAT, false, stride, offset);
    gl.enableVertexAttribArray(programInfo.attribLocations.vertexPosition);
    offset += g_sizeofPos;

    gl.vertexAttribPointer(programInfo.attribLocations.vertexNormal, 3, gl.FLOAT, false, stride, offset);
    gl.enableVertexAttribArray(programInfo.attribLocations.vertexNormal);
    offset += g_sizeofNrm;

    gl.vertexAttribPointer(programInfo.attribLocations.vertexColour, 4, gl.UNSIGNED_BYTE, true, stride, offset);
    gl.enableVertexAttribArray(programInfo.attribLocations.vertexColour);
    offset += g_sizeofCol;
  
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, g_indexBuffer);
    gl.drawElements(gl.TRIANGLES, g_indexCount, gl.UNSIGNED_INT, 0);
  }
}

//
// Initialize a shader program, so WebGL knows how to draw our data
//
function initShaderProgram(gl, vsSource, fsSource) {
  const vertexShader = loadShader(gl, gl.VERTEX_SHADER, vsSource);
  const fragmentShader = loadShader(gl, gl.FRAGMENT_SHADER, fsSource);

  // Create the shader program
  const shaderProgram = gl.createProgram();
  gl.attachShader(shaderProgram, vertexShader);
  gl.attachShader(shaderProgram, fragmentShader);
  gl.linkProgram(shaderProgram);

  // If creating the shader program failed, alert
  if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
    alert('Unable to initialize the shader program: ' + gl.getProgramInfoLog(shaderProgram));
    return null;
  }

  return shaderProgram;
}

//
// creates a shader of the given type, uploads the source and
// compiles it.
//
function loadShader(gl, type, source) {
  const shader = gl.createShader(type);

  // Send the source to the shader object
  gl.shaderSource(shader, source);

  // Compile the shader program
  gl.compileShader(shader);

  // See if it compiled successfully
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    alert('An error occurred compiling the shaders: ' + gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }

  return shader;
}
