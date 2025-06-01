// MuJoCo Model Parser - Extracts geometry and material data from MuJoCo models
// This module parses MuJoCo XML models and provides structured data for Three.js visualization

export class MuJoCoModelParser {
    constructor() {
        this.bodies = [];
        this.geoms = [];
        this.materials = {};
        this.joints = [];
        this.defaults = {}; // Store default classes
    }
    
    async loadFromXML(xmlPath) {
        try {
            console.log('Fetching model from:', xmlPath);
            const response = await fetch(xmlPath);
            
            if (!response.ok) {
                throw new Error(`Failed to fetch model: ${response.status} ${response.statusText}`);
            }
            
            const xmlText = await response.text();
            console.log('XML text length:', xmlText.length);
            
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlText, "text/xml");
            
            // Check for parse errors
            const parseError = xmlDoc.querySelector('parsererror');
            if (parseError) {
                throw new Error('XML parse error: ' + parseError.textContent);
            }
            
            this.parseDefaults(xmlDoc);
            this.parseAssets(xmlDoc);
            this.parseWorldBody(xmlDoc);
            
            // Flatten bodies for easier access and assign indices
            let bodyIndex = 0;
            const bodyMap = {};
            
            // First pass: create a map of all bodies
            function mapBodies(bodyArray) {
                bodyArray.forEach(body => {
                    bodyMap[body.name] = body;
                    if (body.children && body.children.length > 0) {
                        // Recursively map children if they are objects
                        const childObjects = body.children.filter(child => typeof child === 'object');
                        if (childObjects.length > 0) {
                            mapBodies(childObjects);
                        }
                    }
                });
            }
            
            // Map all bodies first
            mapBodies(this.bodies);
            
            // Second pass: assign indices in order
            function assignIndices(body) {
                if (body && !body.hasOwnProperty('index')) {
                    body.index = bodyIndex++;
                    
                    // Process children
                    if (body.children && body.children.length > 0) {
                        body.children.forEach(childName => {
                            if (typeof childName === 'string' && bodyMap[childName]) {
                                assignIndices(bodyMap[childName]);
                            }
                        });
                    }
                }
            }
            
            // Start with root bodies
            this.bodies.forEach(body => assignIndices(body));
            
            return {
                bodies: this.bodies,
                geoms: this.geoms,
                materials: this.materials,
                joints: this.joints
            };
        } catch (error) {
            console.error('Failed to load MuJoCo model:', error);
            throw error;
        }
    }
    
    parseDefaults(xmlDoc) {
        // Parse default classes recursively
        const parseDefaultNode = (node, parentClass = '') => {
            const className = node.getAttribute('class') || parentClass;
            
            // Parse geom defaults in this node
            const geomDefaults = node.querySelector(':scope > geom');
            if (geomDefaults) {
                this.defaults[className] = {
                    size: geomDefaults.getAttribute('size'),
                    type: geomDefaults.getAttribute('type'),
                    fromto: geomDefaults.getAttribute('fromto'),
                    material: geomDefaults.getAttribute('material')
                };
            }
            
            // Parse child default nodes
            const childDefaults = node.querySelectorAll(':scope > default');
            childDefaults.forEach(child => parseDefaultNode(child, className));
        };
        
        // Start with all top-level default nodes
        const defaultNodes = xmlDoc.querySelectorAll('mujoco > default');
        defaultNodes.forEach(node => parseDefaultNode(node));
        
        console.log('Parsed defaults:', this.defaults);
    }
    
    parseAssets(xmlDoc) {
        // Parse materials
        const materials = xmlDoc.querySelectorAll('material');
        materials.forEach(mat => {
            const name = mat.getAttribute('name');
            const rgba = mat.getAttribute('rgba');
            if (name && rgba) {
                const colors = rgba.split(' ').map(parseFloat);
                this.materials[name] = {
                    color: { r: colors[0], g: colors[1], b: colors[2] },
                    opacity: colors[3] || 1,
                    texture: mat.getAttribute('texture'),
                    texuniform: mat.getAttribute('texuniform') === 'true'
                };
            }
        });
        
        console.log('Parsed materials:', this.materials);
    }
    
    parseWorldBody(xmlDoc) {
        const worldBody = xmlDoc.querySelector('worldbody');
        if (!worldBody) return;
        
        // Parse direct children of worldbody
        const childBodies = worldBody.querySelectorAll(':scope > body');
        childBodies.forEach((child, i) => {
            this.parseBody(child, 'world', i);
        });
    }
    
    parseBody(bodyElement, parentName, index) {
        const name = bodyElement.getAttribute('name') || `body_${index}`;
        const pos = this.parseVector(bodyElement.getAttribute('pos'));
        const quat = this.parseQuaternion(bodyElement.getAttribute('quat'));
        
        const body = {
            name,
            parent: parentName,
            position: pos,
            quaternion: quat,
            geoms: [],
            children: []
        };
        
        // Parse geoms in this body
        const geoms = bodyElement.querySelectorAll(':scope > geom');
        geoms.forEach((geom, i) => {
            const geomData = this.parseGeom(geom, body.name, i);
            body.geoms.push(geomData);
            this.geoms.push(geomData);
        });
        
        // Parse joints in this body
        const joints = bodyElement.querySelectorAll(':scope > joint');
        joints.forEach(joint => {
            const jointData = this.parseJoint(joint, body.name);
            this.joints.push(jointData);
        });
        
        this.bodies.push(body);
        
        // Parse child bodies
        const childBodies = bodyElement.querySelectorAll(':scope > body');
        childBodies.forEach((child, i) => {
            const childBody = this.parseBody(child, body.name, i);
            body.children.push(childBody.name);
        });
        
        return body;
    }
    
    parseGeom(geomElement, bodyName, index) {
        const name = geomElement.getAttribute('name') || `${bodyName}_geom_${index}`;
        const geomClass = geomElement.getAttribute('class');
        
        // Get defaults for this class
        const defaults = geomClass && this.defaults[geomClass] ? this.defaults[geomClass] : {};
        
        // Get attributes, falling back to defaults
        const type = geomElement.getAttribute('type') || defaults.type || 'capsule';
        const sizeStr = geomElement.getAttribute('size') || defaults.size;
        const fromtoStr = geomElement.getAttribute('fromto') || defaults.fromto;
        const material = geomElement.getAttribute('material') || defaults.material;
        const rgba = geomElement.getAttribute('rgba');
        
        const pos = this.parseVector(geomElement.getAttribute('pos'));
        const quat = this.parseQuaternion(geomElement.getAttribute('quat'));
        
        // Parse size based on geom type
        let size = [0.05]; // Default radius
        if (sizeStr) {
            const parts = sizeStr.trim().split(/\s+/).map(parseFloat);
            // Different geom types expect different size formats
            if (type === 'sphere') {
                size = [parts[0] || 0.05]; // radius only
            } else if (type === 'capsule' || type === 'cylinder') {
                size = [parts[0] || 0.05, parts[1] || 0.15]; // radius, half-length
            } else if (type === 'box') {
                size = [parts[0] || 0.05, parts[1] || 0.05, parts[2] || 0.05]; // half-sizes
            } else {
                size = parts;
            }
        }
        
        return {
            name,
            body: bodyName,
            type,
            size,
            fromto: fromtoStr ? fromtoStr.trim().split(/\s+/).map(parseFloat) : null,
            position: pos,
            quaternion: quat,
            material: material || 'body', // Default to 'body' material
            rgba: rgba ? this.parseVector(rgba) : null
        };
    }
    
    parseJoint(jointElement, bodyName) {
        const name = jointElement.getAttribute('name');
        const type = jointElement.getAttribute('type') || 'hinge';
        const pos = this.parseVector(jointElement.getAttribute('pos'));
        const axis = this.parseVector(jointElement.getAttribute('axis'));
        const range = jointElement.getAttribute('range');
        
        return {
            name,
            body: bodyName,
            type,
            position: pos,
            axis: axis || [0, 0, 1],
            range: range ? range.split(' ').map(parseFloat) : null
        };
    }
    
    parseVector(str) {
        if (!str) return [0, 0, 0];
        const parts = str.trim().split(/\s+/).map(parseFloat);
        if (parts.length === 1) return [parts[0], parts[0], parts[0]];
        if (parts.length === 2) return [parts[0], parts[1], 0];
        return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
    }
    
    parseQuaternion(str) {
        if (!str) return [1, 0, 0, 0]; // Identity quaternion
        const parts = str.trim().split(/\s+/).map(parseFloat);
        return [parts[0] || 1, parts[1] || 0, parts[2] || 0, parts[3] || 0];
    }
}
