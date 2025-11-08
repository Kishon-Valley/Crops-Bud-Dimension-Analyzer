//-- Firebase Imports and JavaScript Logic -->
   
        import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
        import { getAuth, signInAnonymously, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
        import { getFirestore, doc, onSnapshot, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
        import { setLogLevel } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

        // Set Firebase logging level to help with debugging
        setLogLevel('Debug');

        // --- FIREBASE CONFIGURATION ---
        // Firebase config can be provided via global variables (for hosted environments)
        // or set to null for local development without persistence
        const appId = typeof __app_id !== 'undefined' ? __app_id : 'local-dev-app';
        
        // Check if Firebase config is provided by hosting environment
        let firebaseConfig = null;
        if (typeof __firebase_config !== 'undefined') {
            try {
                firebaseConfig = JSON.parse(__firebase_config);
            } catch (e) {
                console.warn('Failed to parse Firebase config:', e);
            }
        }
        
        const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

        let db, auth, userId = 'anonymous';

        // --- CANVAS & DRAWING STATE ---
        const canvas = document.getElementById('image-canvas');
        const ctx = canvas.getContext('2d');
        const imageUpload = document.getElementById('image-upload');
        const clearAnnotationsBtn = document.getElementById('clear-annotations-btn');
        const aiAnalyzeBtn = document.getElementById('ai-analyze-btn');
        const runComparisonBtn = document.getElementById('run-comparison-btn');
        const downloadReportBtn = document.getElementById('download-report-btn');
        const loadingIndicator = document.getElementById('loading-indicator');
        
        // Input elements
        const standardWidthCmInput = document.getElementById('standard-width-cm');
        const standardHeightCmInput = document.getElementById('standard-height-cm');
        const llmOutputDiv = document.getElementById('llm-output');


        let currentImage = null;
        let imageScale = 1;
        let annotations = []; // [{id, x, y, w, h, label}] in canvas coordinates
        let standardBudId = null; // ID of the bud set as standard
        
        // State variables for real-world dimensions (default to 1.0cm)
        let standardWidthCm = 1.0; 
        let standardHeightCm = 1.0; 
        
        let isDrawing = false;
        let startX, startY;
        let currentAnnotation = null;

        // --- FIRESTORE FUNCTIONS ---

        /**
         * Gets the reference to the Firestore document used to store session data.
         * Uses a private user path: /artifacts/{appId}/users/{userId}/bud_annotations/current_session
         * Returns null if Firestore is not available (local dev mode)
         */
        function getAnnotationsDocRef() {
            if (!db || !userId || userId === 'anonymous') return null;
            try {
                return doc(db, `artifacts/${appId}/users/${userId}/bud_annotations/current_session`);
            } catch (e) {
                console.warn('Failed to get Firestore document reference:', e);
                return null;
            }
        }
        
        /**
         * Saves the current state of annotations, standard ID, and real-world dimensions to Firestore.
         */
        async function saveState() {
            const docRef = getAnnotationsDocRef();
            if (!docRef) {
                console.warn("Firestore not ready or user is anonymous, skipping save.");
                return;
            }
            try {
                // Update internal state from input fields
                standardWidthCm = parseFloat(standardWidthCmInput.value) || 1.0;
                standardHeightCm = parseFloat(standardHeightCmInput.value) || 1.0;

                await setDoc(docRef, {
                    userId: userId,
                    // Serialize complex array structure for safe storage
                    annotations: JSON.stringify(annotations), 
                    standardBudId: standardBudId,
                    standardWidthCm: standardWidthCm, 
                    standardHeightCm: standardHeightCm, 
                    lastUpdate: serverTimestamp(),
                }, { merge: true });
            } catch (error) {
                console.error("Error saving state: ", error);
            }
        }

        /**
         * Sets up a real-time listener to sync state from Firestore.
         * Only runs if Firebase is properly configured.
         */
        function setupFirestoreListener() {
            const docRef = getAnnotationsDocRef();
            if (!docRef) {
                console.log('Firestore not available - running in local mode without persistence');
                return;
            }
            
            onSnapshot(docRef, (docSnapshot) => {
                if (docSnapshot.exists()) {
                    const data = docSnapshot.data();
                    try {
                        const loadedAnnotations = JSON.parse(data.annotations || '[]');
                        standardBudId = data.standardBudId || null;
                        
                        // Load real-world size dimensions
                        standardWidthCm = data.standardWidthCm || 1.0;
                        standardHeightCm = data.standardHeightCm || 1.0;
                        
                        // Update input fields with loaded data 
                        if (standardWidthCmInput) standardWidthCmInput.value = standardWidthCm.toString();
                        if (standardHeightCmInput) standardHeightCmInput.value = standardHeightCm.toString();

                        if (!isDrawing) {
                            // Re-index and relabel loaded annotations to ensure consistency
                            annotations = loadedAnnotations.map((ann, index) => ({
                                ...ann,
                                label: `Bud ${String.fromCharCode(65 + index)}`
                            }));
                            drawCanvas(); 
                        }
                    } catch (e) {
                        console.error("Error parsing stored annotations:", e);
                    }
                }
                renderAnnotationsList();
            }, (error) => {
                console.error("Error listening to Firestore:", error);
            });
        }

        // --- DRAWING LOGIC ---

        function drawCanvas() {
            if (currentImage) {
                // Clear canvas
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                
                // Draw the image
                ctx.drawImage(currentImage, 0, 0, canvas.width, canvas.height);

                // Draw existing annotations
                annotations.forEach((ann) => {
                    const isStandard = ann.id === standardBudId;
                    
                    // Box styling
                    ctx.strokeStyle = isStandard ? '#2563EB' : '#EF4444'; // Blue for standard, Red for others
                    ctx.lineWidth = 4;
                    ctx.setLineDash(isStandard ? [8, 4] : []); // Dashed line for standard
                    ctx.strokeRect(ann.x, ann.y, ann.w, ann.h);
                    ctx.setLineDash([]); // Reset line dash

                    // Label styling
                    ctx.fillStyle = isStandard ? '#2563EB' : '#EF4444'; 
                    const label = isStandard ? `${ann.label} (Standard)` : ann.label;
                    const fontSize = 16;
                    ctx.font = `700 ${fontSize}px Inter, sans-serif`;
                    const textWidth = ctx.measureText(label).width;
                    
                    // Draw a solid background box for the label
                    ctx.fillRect(ann.x, ann.y - fontSize - 5, textWidth + 10, fontSize + 5);
                    
                    // Draw label text
                    ctx.fillStyle = 'white';
                    ctx.fillText(label, ann.x + 5, ann.y - 5);
                });

                // Draw the current box being drawn (if any)
                if (currentAnnotation) {
                    ctx.strokeStyle = '#4F46E5'; // Indigo-600
                    ctx.lineWidth = 3;
                    ctx.strokeRect(currentAnnotation.x, currentAnnotation.y, currentAnnotation.w, currentAnnotation.h);
                }
            } else {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                document.getElementById('canvas-placeholder').classList.remove('hidden');
                document.getElementById('bud-count').textContent = '0';
                clearAnnotationsBtn.disabled = true;
                aiAnalyzeBtn.disabled = true;
                runComparisonBtn.disabled = true;
                downloadReportBtn.disabled = true;
            }
        }

        function getMousePos(event) {
            const rect = canvas.getBoundingClientRect();
            // Use clientX/Y for touch/mouse position
            const clientX = event.clientX || event.touches?.[0]?.clientX;
            const clientY = event.clientY || event.touches?.[0]?.clientY;

            if (clientX === undefined) return { x: 0, y: 0 };

            return {
                x: clientX - rect.left,
                y: clientY - rect.top
            };
        }

        function onMouseDown(e) {
            if (!currentImage) return;
            e.preventDefault();
            isDrawing = true;
            const pos = getMousePos(e);
            startX = pos.x;
            startY = pos.y;
            // Generate a unique ID for the new annotation
            const newId = Date.now().toString(36) + Math.random().toString(36).substring(2);
            currentAnnotation = { id: newId, x: startX, y: startY, w: 0, h: 0 };
        }

        function onMouseMove(e) {
            if (!isDrawing) return;
            e.preventDefault();
            const pos = getMousePos(e);
            const w = pos.x - startX;
            const h = pos.y - startY;

            // Update current annotation with dynamic width/height
            currentAnnotation.x = Math.min(startX, pos.x);
            currentAnnotation.y = Math.min(startY, pos.y);
            currentAnnotation.w = Math.abs(w);
            currentAnnotation.h = Math.abs(h);
            
            drawCanvas();
        }

        function onMouseUp(e) {
            if (!isDrawing) return;
            e.preventDefault();
            isDrawing = false;

            if (currentAnnotation.w > 5 && currentAnnotation.h > 5) { // Only save if box is reasonable size
                const newIndex = annotations.length;
                currentAnnotation.label = `Bud ${String.fromCharCode(65 + newIndex)}`;

                annotations.push(currentAnnotation);
                saveState(); // Save to Firestore
            }
            currentAnnotation = null;
            drawCanvas();
            renderAnnotationsList();
        }
        
        function clearAllAnnotations() {
            annotations = [];
            standardBudId = null;
            saveState(); // Save empty array
            drawCanvas();
            llmOutputDiv.innerHTML = 'The report will appear here. Start by setting a standard or running an AI analysis.';
            downloadReportBtn.disabled = true; 
            renderAnnotationsList();
        }
        
        // --- STANDARD & COMPARISON LOGIC ---

        function setStandardBud(budId) {
            standardBudId = budId;
            saveState();
        }
        
        function getArea(ann) {
            return ann.w * ann.h;
        }

        /**
         * Deletes an annotation by its ID, re-indexes remaining annotations, and saves state.
         */
        function deleteAnnotation(budId) {
            // 1. Filter out the deleted annotation
            annotations = annotations.filter(ann => ann.id !== budId);

            // 2. Re-index and relabel remaining annotations (A, B, C...)
            annotations.forEach((ann, index) => {
                ann.label = `Bud ${String.fromCharCode(65 + index)}`;
            });

            // 3. Check if the deleted bud was the standard
            if (standardBudId === budId) {
                standardBudId = null; // Reset standard
                llmOutputDiv.textContent = 'Standard Bud was deleted. Please set a new standard before running comparison.';
                downloadReportBtn.disabled = true;
            }

            // 4. Update UI and save state
            saveState();
            drawCanvas();
            renderAnnotationsList();
        }


        function runDimensionComparison() {
            loadingIndicator.classList.remove('hidden');
            
            if (!standardBudId) {
                llmOutputDiv.textContent = 'Error: Please set a Standard Bud first.';
                loadingIndicator.classList.add('hidden');
                downloadReportBtn.disabled = true;
                return;
            }

            const standardBud = annotations.find(ann => ann.id === standardBudId);
            if (!standardBud) {
                 llmOutputDiv.textContent = 'Error: Standard Bud not found.';
                loadingIndicator.classList.add('hidden');
                downloadReportBtn.disabled = true;
                return;
            }

            // 1. Get pixel and real-world dimensions from standard bud and inputs
            const standardPixelWidth = standardBud.w;
            const standardPixelHeight = standardBud.h;
            
            const cmWidth = parseFloat(standardWidthCmInput.value);
            const cmHeight = parseFloat(standardHeightCmInput.value);

            if (isNaN(cmWidth) || isNaN(cmHeight) || cmWidth <= 0 || cmHeight <= 0) {
                 llmOutputDiv.textContent = 'Error: Please enter valid positive values for Standard Bud Width and Height (cm).';
                loadingIndicator.classList.add('hidden');
                downloadReportBtn.disabled = true;
                return;
            }
            
            // 2. Calculate Pixels Per Centimeter (PPC)
            const ppcWidth = standardPixelWidth / cmWidth;
            const ppcHeight = standardPixelHeight / cmHeight;

            // 3. Generate the Report
            let report = `### ⚖️ Dimension Comparison Report (Standard: ${standardBud.label})\n`;
            report += `| Key Metric | Value |\n`;
            report += `|:---|:---|\n`;
            report += `| Standard Bud Pixel (W x H) | ${standardPixelWidth.toFixed(0)}px x ${standardPixelHeight.toFixed(0)}px |\n`;
            report += `| **Standard Bud Real (W x H)** | **${cmWidth.toFixed(2)}cm x ${cmHeight.toFixed(2)}cm** |\n`;
            report += `| Calculated PPC (W) | ${ppcWidth.toFixed(2)} Pixels/cm |\n`;
            report += `| Calculated PPC (H) | ${ppcHeight.toFixed(2)} Pixels/cm |\n\n`;

            // Bud Dimensions Table
            report += `### Bud Dimensions\n`;
            report += `| Bud | Width (cm) | Height (cm) | Area (cm²) |\n`;
            report += `|:---:|:----------:|:-----------:|:----------:|\n`;
            
            // Loop through all annotations and convert to CM
            annotations.forEach(ann => {
                // Convert pixel dimensions to CM using the calculated PPC factors
                const widthCm = ann.w / ppcWidth;
                const heightCm = ann.h / ppcHeight;
                const areaCm2 = widthCm * heightCm;
                
                report += `| ${ann.label} | ${widthCm.toFixed(2)} | ${heightCm.toFixed(2)} | **${areaCm2.toFixed(2)}** |\n`;
            });

            llmOutputDiv.textContent = report;
            loadingIndicator.classList.add('hidden');
            downloadReportBtn.disabled = false;
            
            // Also save the updated standard size inputs
            saveState();
        }


        // --- UI RENDER FUNCTIONS ---
        
        function renderAnnotationsList() {
            const list = document.getElementById('annotations-list');
            const countSpan = document.getElementById('bud-count');
            const noAnnotationsEl = document.getElementById('no-annotations');
            
            countSpan.textContent = annotations.length;
            list.innerHTML = '';
            
            // Update button states
            clearAnnotationsBtn.disabled = annotations.length === 0 || !currentImage;
            aiAnalyzeBtn.disabled = annotations.length === 0 || !currentImage;
            runComparisonBtn.disabled = annotations.length === 0 || !currentImage || !standardBudId;
            
            // Check if the output div contains the default placeholder text
            const isDefaultOutput = llmOutputDiv.textContent.includes('The report will appear here') || llmOutputDiv.textContent.includes('Error:');
            downloadReportBtn.disabled = isDefaultOutput;
            
            const standardBud = annotations.find(ann => ann.id === standardBudId);
            document.getElementById('standard-info').innerHTML = `Standard Bud: <span class="font-extrabold">${standardBud ? standardBud.label : 'None Set'}</span>`;

            if (noAnnotationsEl) {
                if (annotations.length === 0) {
                    noAnnotationsEl.classList.remove('hidden');
                    // Reset input values if all annotations are cleared
                    standardWidthCmInput.value = standardWidthCm.toString();
                    standardHeightCmInput.value = standardHeightCm.toString();
                    return;
                }
                noAnnotationsEl.classList.add('hidden');
            } else if (annotations.length === 0) {
                return;
            }

            annotations.forEach((ann) => {
                const isStandard = ann.id === standardBudId;
                const listItem = document.createElement('div');
                
                const w = ann.w.toFixed(0);
                const h = ann.h.toFixed(0);
                const area = getArea(ann).toFixed(0);

                listItem.className = 'flex flex-col sm:flex-row justify-between items-start sm:items-center text-gray-700 bg-gray-100 p-2 rounded-lg border-l-4 ' + (isStandard ? 'border-blue-600' : 'border-red-600');
                
                const buttonContainer = document.createElement('div');
                buttonContainer.className = 'flex space-x-2 mt-2 sm:mt-0';

                // Set Standard Button
                const setStandardButton = document.createElement('button');
                setStandardButton.textContent = isStandard ? '✅ Standard' : 'Set as Standard';
                setStandardButton.className = `set-standard-btn text-white font-semibold py-1 px-3 text-xs rounded-full shadow-sm transition ${isStandard ? 'bg-gray-400 cursor-not-allowed' : 'btn-standard hover:shadow-md'}`;
                setStandardButton.disabled = isStandard;
                if (!isStandard) {
                    setStandardButton.addEventListener('click', () => setStandardBud(ann.id));
                }
                buttonContainer.appendChild(setStandardButton);

                // Delete Button
                const deleteButton = document.createElement('button');
                deleteButton.textContent = '❌ Delete';
                deleteButton.className = 'btn-delete text-white font-semibold py-1 px-3 text-xs rounded-full shadow-sm hover:shadow-md';
                deleteButton.addEventListener('click', () => deleteAnnotation(ann.id));
                buttonContainer.appendChild(deleteButton);


                listItem.innerHTML = `
                    <div class="flex-1">
                        <span class="font-bold text-lg ${isStandard ? 'text-blue-700' : 'text-red-700'}">${ann.label}</span>
                        <p class="text-xs text-gray-500">Area: ${area} px² (W:${w} x H:${h})</p>
                    </div>
                `;
                
                listItem.appendChild(buttonContainer);
                list.appendChild(listItem);
            });
        }

        function loadImage(file) {
            // Validate file type
            const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
            if (!validTypes.includes(file.type)) {
                llmOutputDiv.textContent = 'Error: Please upload a valid image file (JPEG, PNG, GIF, or WebP).';
                return;
            }

            // Validate file size (max 10MB)
            const maxSize = 10 * 1024 * 1024; // 10MB in bytes
            if (file.size > maxSize) {
                llmOutputDiv.textContent = 'Error: Image file size must be less than 10MB.';
                return;
            }

            const reader = new FileReader();
            reader.onerror = () => {
                llmOutputDiv.textContent = 'Error: Failed to read the image file.';
            };
            reader.onload = (event) => {
                const img = new Image();
                img.onerror = () => {
                    llmOutputDiv.textContent = 'Error: Failed to load the image. Please try a different file.';
                };
                img.onload = () => {
                    currentImage = img;
                    const containerWidth = canvas.parentNode.clientWidth;
                    canvas.width = containerWidth;
                    imageScale = img.width / canvas.width;
                    canvas.height = img.height / imageScale; 
                    
                    document.getElementById('canvas-placeholder').classList.add('hidden');
                    clearAllAnnotations(); // Clear old annotations, which calls saveState() and drawCanvas()
                };
                img.src = event.target.result;
            };
            reader.readAsDataURL(file);
        }

        // --- GEMINI API MULTIMODAL INTEGRATION ---
        
        async function generateAIAnalysis() {
            if (!currentImage) return;

            loadingIndicator.classList.remove('hidden');
            aiAnalyzeBtn.disabled = true;
            runComparisonBtn.disabled = true;
            downloadReportBtn.disabled = true;
            llmOutputDiv.textContent = 'Please wait, analyzing the image and annotations...';

            try {
                drawCanvas(); // Ensure final boxes are drawn
                const base64Image = canvas.toDataURL('image/png').split(',')[1];
                
                let annotationDetails = 'The user has provided the following annotations (bud regions) in the image:';
                
                const relativeAnnotations = annotations.map((ann) => {
                    // Normalize coordinates to percentage of canvas size for context
                    const xPct = ((ann.x + ann.w / 2) / canvas.width * 100).toFixed(1);
                    const yPct = ((ann.y + ann.h / 2) / canvas.height * 100).toFixed(1);
                    const wPct = (ann.w / canvas.width * 100).toFixed(1);
                    const hPct = (ann.h / canvas.height * 100).toFixed(1);
                    
                    return `\n- ${ann.label} (Area: ${getArea(ann).toFixed(0)} px²): Centered at approx. (${xPct}%, ${yPct}%), covering a relative width of ${wPct}% and height of ${hPct}%.`;
                }).join('');
                
                const standardBud = annotations.find(a => a.id === standardBudId);
                const standardBudLabel = standardBud ? standardBud.label : 'None Set';

                const userQuery = `You are a specialized botanist and crop analyst. Review the provided image of plant material. The user has drawn bounding boxes around regions of interest. The standard bud for dimension comparison is set to: ${standardBudLabel}. Standard real-world dimensions are set to ${standardWidthCm.toFixed(2)}cm x ${standardHeightCm.toFixed(2)}cm. ${annotationDetails}${relativeAnnotations}\n\nProvide a detailed, professional, descriptive analysis focusing on morphology, color, and apparent developmental stage for the labeled buds. Specifically, comment on the visual differences and similarities between the ${standardBudLabel} and the other buds, taking the set real-world dimensions into account for perceived size. Conclude with a single sentence on the potential next steps for a dimension study on this sample.`;

                let response = await fetchWithExponentialBackoff('/api/analyze', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        prompt: userQuery,
                        image: base64Image,
                    })
                });

                const result = await response.json();
                if (!response.ok) {
                    throw new Error(result.error || 'Gemini analysis failed.');
                }

                const text = result.text || "Sorry, I couldn't generate an analysis. Please check your image and try again.";
                
                llmOutputDiv.textContent = `### 🔬 AI Descriptive Analysis\n\n${text}`;

            } catch (error) {
                console.error("Gemini API Error:", error);
                llmOutputDiv.textContent = `An error occurred while connecting to the AI: ${error.message}`;
            } finally {
                loadingIndicator.classList.add('hidden');
                aiAnalyzeBtn.disabled = annotations.length === 0 || !currentImage;
                runComparisonBtn.disabled = annotations.length === 0 || !currentImage || !standardBudId;
                downloadReportBtn.disabled = llmOutputDiv.textContent.includes('The report will appear here') || llmOutputDiv.textContent.includes('Error:');
            }
        }
        
        /**
         * Utility for exponential backoff during API calls.
         */
        async function fetchWithExponentialBackoff(url, options, maxRetries = 3) {
            for (let attempt = 0; attempt < maxRetries; attempt++) {
                try {
                    const response = await fetch(url, options);
                    if (response.status !== 429) {
                        return response;
                    }
                    if (attempt === maxRetries - 1) {
                        throw new Error('Maximum retries reached for rate limiting (429).');
                    }
                } catch (error) {
                    if (attempt === maxRetries - 1) throw error;
                    const delay = Math.pow(2, attempt) * 1000;
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
            throw new Error('Failed to fetch after all retries.');
        }
        
        // --- DOWNLOAD FUNCTION ---
        function downloadReportFile() {
            const reportContent = llmOutputDiv.textContent;
            
            if (reportContent.includes('The report will appear here') || reportContent.includes('Error:')) {
                console.error("No valid report content to download.");
                return;
            }

            // Create a Blob containing the content with Markdown type
            const blob = new Blob([reportContent], { type: 'text/markdown;charset=utf-8' });
            
            // Create a temporary link element
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'bud_dimension_analysis_report.md';
            
            document.body.appendChild(a);
            a.click();
            
            // Clean up: remove the link and revoke the URL
            document.body.removeChild(a);
            URL.revokeObjectURL(a.href);
        }


        // --- INITIALIZATION & AUTH ---

        function initApp() {
            document.getElementById('user-info').textContent = `User ID: ${userId}`;

            // Setup Event Listeners
            imageUpload.addEventListener('change', (e) => {
                if (e.target.files.length > 0) {
                    loadImage(e.target.files[0]);
                }
            });
            clearAnnotationsBtn.addEventListener('click', clearAllAnnotations);
            aiAnalyzeBtn.addEventListener('click', generateAIAnalysis);
            runComparisonBtn.addEventListener('click', runDimensionComparison);
            downloadReportBtn.addEventListener('click', downloadReportFile);

            // Listeners for standard size inputs
            standardWidthCmInput.addEventListener('change', saveState);
            standardHeightCmInput.addEventListener('change', saveState);

            // Canvas drawing listeners (using standard mouse and basic touch events)
            canvas.addEventListener('mousedown', onMouseDown);
            canvas.addEventListener('mousemove', onMouseMove);
            canvas.addEventListener('mouseup', onMouseUp);
            canvas.addEventListener('mouseout', (e) => { if (isDrawing) onMouseUp(e); }); 
            
            // Touch events for Chromebook/mobile
            canvas.addEventListener('touchstart', (e) => onMouseDown(e.touches[0]));
            canvas.addEventListener('touchmove', (e) => onMouseMove(e.touches[0]));
            canvas.addEventListener('touchend', onMouseUp);

            window.addEventListener('resize', () => {
                if (currentImage) {
                    const containerWidth = canvas.parentNode.clientWidth;
                    imageScale = currentImage.width / containerWidth;
                    canvas.width = containerWidth;
                    canvas.height = currentImage.height / imageScale;
                    drawCanvas();
                }
            });

            // Start listening to Firestore for user state
            setupFirestoreListener();
        }

        // Initialize Firebase and authenticate the user
        if (firebaseConfig) {
            try {
                const app = initializeApp(firebaseConfig);
                db = getFirestore(app);
                auth = getAuth(app);

                const authenticate = (token) => {
                    // If a custom token is provided by the environment, use it.
                    if (token) {
                        return signInWithCustomToken(auth, token);
                    } 
                    // Otherwise, sign in anonymously.
                    else {
                        return signInAnonymously(auth);
                    }
                };

                authenticate(initialAuthToken)
                    .then(userCredential => {
                        userId = userCredential.user.uid;
                        console.log('Firebase authenticated successfully');
                        initApp();
                    })
                    .catch(error => {
                        console.error("Firebase authentication failed:", error);
                        userId = 'local-user';
                        console.log('Running in local mode without persistence');
                        initApp(); 
                    });
            } catch (error) {
                console.error('Firebase initialization failed:', error);
                userId = 'local-user';
                console.log('Running in local mode without persistence');
                initApp();
            }
        } else {
            // Local development mode without Firebase
            console.log('Firebase not configured - running in local mode without persistence');
            userId = 'local-user';
            initApp(); 
        }
