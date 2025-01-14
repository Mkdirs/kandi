export var RenderMode;
(function (RenderMode) {
    RenderMode[RenderMode["NORMAL"] = 0] = "NORMAL";
    RenderMode[RenderMode["SDF"] = 1] = "SDF";
})(RenderMode || (RenderMode = {}));
;
export class Renderer {
    constructor(gl) {
        this.backgroundColor = [0, 0, 0];
        this.renderMode = RenderMode.NORMAL;
        this.epsilon = 0.001;
        this.gl = gl;
        this.prog = this.gl.createProgram();
        this.initShaders();
        this.setupScreen();
    }
    setupScreen() {
        const vertexLoc = this.gl.getAttribLocation(this.prog, "vertexPosition");
        if (vertexLoc < 0) {
            console.error("Could not get attribute vertexPosition");
            return;
        }
        const vertexBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, vertexBuffer);
        this.gl.enableVertexAttribArray(vertexLoc);
        const vertices = new Float32Array([
            -1, 1, //Top left
            1, 1, //Top right
            -1, -1, //Bottom left
            1, 1, //Top right
            1, -1, //Bottom right
            -1, -1 //Bottom left
        ]);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.STATIC_DRAW);
        this.gl.vertexAttribPointer(vertexLoc, 2, this.gl.FLOAT, false, 0, 0);
    }
    initShaders() {
        const vertex = this.gl.createShader(this.gl.VERTEX_SHADER);
        const fragment = this.gl.createShader(this.gl.FRAGMENT_SHADER);
        this.gl.shaderSource(vertex, 
        /*glsl*/ `#version 300 es
            precision mediump float;

            in vec2 vertexPosition;


            void main(){
                gl_Position = vec4(vertexPosition, 0.0, 1.0);
            }
            `);
        this.gl.shaderSource(fragment, 
        /*glsl*/ `#version 300 es
            precision mediump float;

            out vec4 outputColor;
            uniform vec3 backgroundColor;
            uniform vec2 canvasSize;
            uniform float deltaTime;
            uniform vec2 mouse;
            uniform bool mouseInViewport;
            uniform bool mousePressed;

            uniform int renderMode;
            uniform float EPSILON;
            const float MAX_DIST = 100000.0;

            struct Transform{
                vec3 position;
                vec3 rotation;
                vec3 scale;
            };

            struct Material{
                vec3 color;
            };

            struct SDFPrimitive{
                Transform transform;
                Material material;
            };

            struct SceneObject{
                Material material;
                float dist;
            };

            struct RaymarchHit{
                SceneObject object;
                bool hit;
                float totalDist;
            };

            SDFPrimitive empty(vec3 position){
                return SDFPrimitive(Transform(position, vec3(0), vec3(1)), Material(vec3(0)) );
            }

            // Primitives
            SceneObject sdSphere(SDFPrimitive primitive, vec3 samplePoint){
                float dist = length(samplePoint)-primitive.transform.scale.x;
                return SceneObject(primitive.material, dist);
            }

            SceneObject sdBox(SDFPrimitive primitive, vec3 samplePoint){
                vec3 q = abs(samplePoint ) - primitive.transform.scale;
                float dist = length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);

                return SceneObject(primitive.material, dist);
            }

            SceneObject sdCapsule(SDFPrimitive primitive, vec3 samplePoint){
                samplePoint.y -= clamp(samplePoint.y, -primitive.transform.scale.x, primitive.transform.scale.x);
                float dist = length(samplePoint )-primitive.transform.scale.y;
                return SceneObject(primitive.material, dist);
            }

            // Transformations
            mat2 rot2D(float angle){
                float s = sin(angle);
                float c = cos(angle);

                return mat2(c, -s, s, c);
            }



            vec3 applyTranslate(vec3 samplePoint, SDFPrimitive primitive){
                return samplePoint-primitive.transform.position;
            }

            vec3 applyRotation(in vec3 samplePoint, SDFPrimitive primitive){
                // Around z
                samplePoint.xy *= rot2D(primitive.transform.rotation.z);
                
                // Around y
                samplePoint.xz *= rot2D(primitive.transform.rotation.y);
                
                // Around x
                samplePoint.yz *= rot2D(primitive.transform.rotation.x);

                return samplePoint;
            }

            vec3 applyTransforms(vec3 samplePoint, SDFPrimitive object){
                return applyRotation(applyTranslate(samplePoint, object), object);
            }


            // Opérations
            SceneObject opUnion(SceneObject a, SceneObject b){
                float m = min(a.dist, b.dist);
                if(m == a.dist){return a;}

                return b;
            }

            
            SceneObject opSmoothUnion(SceneObject a, SceneObject b, float k ){
                float h = clamp( 0.5 + 0.5*(b.dist-a.dist)/k, 0.0, 1.0 );

                Material m = Material(mix(b.material.color, a.material.color, h));

                float dist = mix( b.dist, a.dist, h ) - k*h*(1.0-h);

                return SceneObject(m, dist);
            }


            SceneObject opInter(SceneObject a, SceneObject b){
                float m = max(a.dist, b.dist);
                if(m == a.dist){return a;}

                return b;
            }

            SceneObject opSmoothInter(SceneObject a, SceneObject b, float k ){
                float h = clamp( 0.5 - 0.5*(b.dist-a.dist)/k, 0.0, 1.0 );
                Material m = Material(mix(b.material.color, a.material.color, h));

                float dist = mix( b.dist, a.dist, h ) + k*h*(1.0-h);
                return SceneObject(m, dist);
            }

            SceneObject opDiff(SceneObject a, SceneObject b){
                float m = max(a.dist, -b.dist);
                if(m == -b.dist){
                    return SceneObject(b.material, -b.dist);
                }

                return a;
            }

            SceneObject opSmoothDiff(SceneObject a, SceneObject b, float k ){
                float h = clamp( 0.5 - 0.5*(b.dist+a.dist)/k, 0.0, 1.0 );
                Material m = Material(mix(b.material.color, a.material.color, h));
                float dist = mix( a.dist, -b.dist, h ) + k*h*(1.0-h);
                return SceneObject(m, dist);
            }

            SceneObject scene(vec3 p){


                SDFPrimitive a = empty(vec3(-2.5, 0, 5.0));
                a.transform.rotation = vec3(0, 0, 0)*deltaTime;
                a.material.color = vec3(0.5, 0.2, 1);
                SceneObject _a = sdBox(a, applyTransforms(p, a));


                SDFPrimitive b = empty(vec3(1.5, 0, 5.0));
                b.transform.scale.x = 1.0;
                b.transform.position += vec3(2.5, 0, 0) * sin(1.5*deltaTime);
                b.material.color = vec3(0.5, 1, 0.25);
                SceneObject _b = sdSphere(b, applyTransforms(p, b));

                float dist = length(b.transform.position - a.transform.position);
                return  opSmoothUnion(_a, _b, dist / 2.5);
            }

            RaymarchHit raymarch(vec3 camOrigin, vec3 camDir){
                int i = 0;
                bool touched = false;
                float dist = 0.0;
                SceneObject object;

                while(i < 200 && !touched && dist < MAX_DIST){
                    vec3 p = camOrigin + camDir * dist;

                    object = scene(p);

                    dist += object.dist;
                    touched = (object.dist < EPSILON);
                    i = i+1;
                }

                return RaymarchHit(object, touched, dist);
            }

            void main(){
                vec2 coord = vec2(gl_FragCoord);
                vec2 uv = (coord * 2.0 - canvasSize) / canvasSize.y;
                vec2 mousePos = (mouse * 2.0 - canvasSize) / canvasSize.y;
                mousePos.y *= -1.;

                vec3 origin = vec3(0);
                vec3 dir = normalize(vec3(uv*.7, 1.0));

                vec3 col = vec3(0);


                /*origin.yz *= rot2D(-mousePos.y);
                dir.yz *= rot2D(-mousePos.y);

                origin.xz *= rot2D(-mousePos.x);
                dir.xz *= rot2D(-mousePos.x);*/

                RaymarchHit hit = raymarch(origin, dir);

                
                if(length(mousePos-uv) <= 0.0125 && mouseInViewport){
                    col = vec3(0);
                    if(hit.hit && renderMode != ${RenderMode.SDF}){
                        col = vec3(1)-hit.object.material.color;
                    }
                    
                }else if(hit.hit){
                    col = hit.object.material.color;
                    if(renderMode == ${RenderMode.SDF}){
                        col = vec3(hit.object.dist / MAX_DIST);
                    }
                    
                }else{
                    col = backgroundColor;
                    if(renderMode == ${RenderMode.SDF}){
                        col = vec3(hit.object.dist / MAX_DIST);
                    }
                    
                }

                outputColor = vec4(col, 1.0);
            }
            `);
        this.gl.compileShader(vertex);
        this.gl.compileShader(fragment);
        if (!this.gl.getShaderParameter(vertex, this.gl.COMPILE_STATUS)) {
            console.error(`Compiling error in vertex shader:\n${this.gl.getShaderInfoLog(vertex)}`);
            this.gl.deleteShader(vertex);
            this.gl.deleteShader(fragment);
            return;
        }
        if (!this.gl.getShaderParameter(fragment, this.gl.COMPILE_STATUS)) {
            console.error(`Compiling error in fragment shader:\n${this.gl.getShaderInfoLog(fragment)}`);
            this.gl.deleteShader(vertex);
            this.gl.deleteShader(fragment);
            return;
        }
        this.gl.attachShader(this.prog, vertex);
        this.gl.attachShader(this.prog, fragment);
        this.gl.linkProgram(this.prog);
        if (!this.gl.getProgramParameter(this.prog, this.gl.LINK_STATUS)) {
            console.error(`Linking error of shader program:\n${this.gl.getProgramInfoLog(this.prog)}`);
            this.gl.deleteProgram(this.prog);
            return;
        }
    }
    render(dt) {
        this.gl.useProgram(this.prog);
        this.gl.uniform3f(this.gl.getUniformLocation(this.prog, "backgroundColor"), ...this.backgroundColor);
        this.gl.uniform2f(this.gl.getUniformLocation(this.prog, "canvasSize"), this.gl.canvas.width, this.gl.canvas.height);
        this.gl.uniform1f(this.gl.getUniformLocation(this.prog, "deltaTime"), dt);
        this.gl.uniform1i(this.gl.getUniformLocation(this.prog, "renderMode"), this.renderMode);
        this.gl.uniform1f(this.gl.getUniformLocation(this.prog, "EPSILON"), this.epsilon);
        this.gl.drawArrays(this.gl.TRIANGLES, 0, 6);
    }
    sendMousePos(x, y) {
        this.gl.uniform2f(this.gl.getUniformLocation(this.prog, "mouse"), x, y);
    }
    mouseInViewport(b) {
        this.gl.uniform1i(this.gl.getUniformLocation(this.prog, "mouseInViewport"), b ? 1 : 0);
    }
    mousePressed(b) {
        this.gl.uniform1i(this.gl.getUniformLocation(this.prog, "mousePressed"), b ? 1 : 0);
    }
}
