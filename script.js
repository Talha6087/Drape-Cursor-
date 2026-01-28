(() => {
  const uploadInput = document.getElementById("uploadInput");
  const captureInput = document.getElementById("captureInput");
  const canvas = document.getElementById("imageCanvas");
  const overlayMessage = document.getElementById("canvasOverlayMessage");

  const referenceShapeSelect = document.getElementById("referenceShape");
  const refDiameterInput = document.getElementById("refDiameter");
  const refWidthInput = document.getElementById("refWidth");
  const refHeightInput = document.getElementById("refHeight");

  const markReferenceBtn = document.getElementById("markReferenceBtn");
  const autoFabricBtn = document.getElementById("autoFabricBtn");
  const startFabricBtn = document.getElementById("startFabricBtn");
  const closeFabricBtn = document.getElementById("closeFabricBtn");
  const resetAllBtn = document.getElementById("resetAllBtn");

  const refPixelAreaEl = document.getElementById("refPixelArea");
  const refRealAreaEl = document.getElementById("refRealArea");
  const fabricPixelAreaEl = document.getElementById("fabricPixelArea");
  const fabricRealAreaEl = document.getElementById("fabricRealArea");

  const ctx = canvas.getContext("2d");

  // Offscreen canvases for image processing and auto fabric mask
  let offscreenCanvas = null;
  let offscreenCtx = null;
  let maskCanvas = null;
  let maskCtx = null;

  let image = null;
  let scale = 1; // displayScale (image_pixels -> canvas_pixels)

  // Reference selection
  let isMarkingReference = false;
  let referenceShape = "circle"; // circle | rectangle
  let refStart = null;
  let refEnd = null;
  let refPixelArea = null;
  let refRealArea = null;
  let cm2PerPixel = null;

  // Fabric polygon selection
  let isMarkingFabric = false;
  let fabricPoints = []; // in image pixel coordinates
  let fabricPixelArea = null;
  let hasAutoFabricMask = false;

  function resetAll() {
    image = null;
    scale = 1;
    isMarkingReference = false;
    refStart = null;
    refEnd = null;
    refPixelArea = null;
    refRealArea = null;
    cm2PerPixel = null;

    isMarkingFabric = false;
    fabricPoints = [];
    fabricPixelArea = null;
    hasAutoFabricMask = false;

    if (maskCtx && maskCanvas) {
      maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
    }

    refPixelAreaEl.textContent = "–";
    refRealAreaEl.textContent = "–";
    fabricPixelAreaEl.textContent = "–";
    fabricRealAreaEl.textContent = "–";

    overlayMessage.textContent = "Load an image to begin.";
    overlayMessage.style.display = "flex";

    closeFabricBtn.disabled = true;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  function loadImage(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        image = img;
        fitImageToCanvas();
        draw();
        overlayMessage.textContent =
          "Image loaded. Mark reference, then outline fabric.";
        overlayMessage.style.display = "flex";
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  function fitImageToCanvas() {
    if (!image) return;
    const maxWidth = canvas.parentElement.clientWidth;
    const maxHeight = 460;

    let width = image.width;
    let height = image.height;

    const widthRatio = maxWidth / width;
    const heightRatio = maxHeight / height;
    const ratio = Math.min(widthRatio, heightRatio, 1);

    width = Math.round(width * ratio);
    height = Math.round(height * ratio);
    scale = ratio;

    canvas.width = width;
    canvas.height = height;

    // Prepare offscreen canvases at full image resolution for processing
    offscreenCanvas = document.createElement("canvas");
    offscreenCanvas.width = image.width;
    offscreenCanvas.height = image.height;
    offscreenCtx = offscreenCanvas.getContext("2d");
    offscreenCtx.drawImage(image, 0, 0);

    maskCanvas = document.createElement("canvas");
    maskCanvas.width = image.width;
    maskCanvas.height = image.height;
    maskCtx = maskCanvas.getContext("2d");
    maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
  }

  function canvasToImageCoords(x, y) {
    return {
      x: x / scale,
      y: y / scale,
    };
  }

  function draw() {
    if (!image) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, image.width * scale, image.height * scale);

    // Draw auto-detected fabric mask (shadow-based)
    if (hasAutoFabricMask && maskCanvas) {
      ctx.save();
      ctx.globalAlpha = 0.45;
      ctx.drawImage(
        maskCanvas,
        0,
        0,
        image.width,
        image.height,
        0,
        0,
        image.width * scale,
        image.height * scale
      );
      ctx.restore();
    }

    // Draw reference selection
    if (refStart && refEnd) {
      ctx.save();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#60a5fa";
      ctx.fillStyle = "rgba(37, 99, 235, 0.18)";

      const startCanvas = {
        x: refStart.x * scale,
        y: refStart.y * scale,
      };
      const endCanvas = {
        x: refEnd.x * scale,
        y: refEnd.y * scale,
      };

      if (referenceShape === "circle") {
        const dx = endCanvas.x - startCanvas.x;
        const dy = endCanvas.y - startCanvas.y;
        const r = Math.sqrt(dx * dx + dy * dy);

        ctx.beginPath();
        ctx.arc(startCanvas.x, startCanvas.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else {
        const x = Math.min(startCanvas.x, endCanvas.x);
        const y = Math.min(startCanvas.y, endCanvas.y);
        const w = Math.abs(endCanvas.x - startCanvas.x);
        const h = Math.abs(endCanvas.y - startCanvas.y);
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.fill();
        ctx.stroke();
      }

      ctx.restore();
    }

    // Draw fabric polygon
    if (fabricPoints.length > 0) {
      ctx.save();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#22c55e";
      ctx.fillStyle = "rgba(34, 197, 94, 0.16)";

      ctx.beginPath();
      fabricPoints.forEach((pt, index) => {
        const x = pt.x * scale;
        const y = pt.y * scale;
        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      if (!isMarkingFabric && fabricPoints.length > 2) {
        ctx.closePath();
        ctx.fill();
      }
      ctx.stroke();

      // draw small points
      ctx.fillStyle = "#22c55e";
      fabricPoints.forEach((pt) => {
        const x = pt.x * scale;
        const y = pt.y * scale;
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
      });

      ctx.restore();
    }
  }

  function updateShapeFields() {
    referenceShape = referenceShapeSelect.value;
    const circleFields = document.querySelectorAll(".circle-only");
    const rectFields = document.querySelectorAll(".rect-only");

    if (referenceShape === "circle") {
      circleFields.forEach((el) => (el.style.display = "block"));
      rectFields.forEach((el) => (el.style.display = "none"));
    } else {
      circleFields.forEach((el) => (el.style.display = "none"));
      rectFields.forEach((el) => (el.style.display = "block"));
    }

    // changing shape invalidates current reference
    refStart = null;
    refEnd = null;
    refPixelArea = null;
    refRealArea = null;
    cm2PerPixel = null;
    refPixelAreaEl.textContent = "–";
    refRealAreaEl.textContent = "–";
    fabricRealAreaEl.textContent = "–";
    draw();
  }

  function computeReferenceAreas() {
    if (!refStart || !refEnd) return;

    let refAreaPx = 0;
    if (referenceShape === "circle") {
      const dx = refEnd.x - refStart.x;
      const dy = refEnd.y - refStart.y;
      const rPx = Math.sqrt(dx * dx + dy * dy);
      refAreaPx = Math.PI * rPx * rPx;

      const diameterCm = parseFloat(refDiameterInput.value);
      if (!diameterCm || diameterCm <= 0) return;
      const radiusCm = diameterCm / 2;
      const areaCm2 = Math.PI * radiusCm * radiusCm;
      refRealArea = areaCm2;
    } else {
      const wPx = Math.abs(refEnd.x - refStart.x);
      const hPx = Math.abs(refEnd.y - refStart.y);
      refAreaPx = wPx * hPx;

      const wCm = parseFloat(refWidthInput.value);
      const hCm = parseFloat(refHeightInput.value);
      if (!wCm || wCm <= 0 || !hCm || hCm <= 0) return;
      refRealArea = wCm * hCm;
    }

    if (refAreaPx <= 0 || !refRealArea || refRealArea <= 0) return;

    refPixelArea = refAreaPx;
    cm2PerPixel = refRealArea / refPixelArea;

    refPixelAreaEl.textContent = refPixelArea.toFixed(0) + " px²";
    refRealAreaEl.textContent = refRealArea.toFixed(2) + " cm²";

    // if fabric already defined, update its real area too
    if (fabricPixelArea && cm2PerPixel) {
      const areaCm2 = fabricPixelArea * cm2PerPixel;
      fabricRealAreaEl.textContent = areaCm2.toFixed(2) + " cm²";
    }
  }

  function polygonArea(points) {
    // Shoelace formula, points in image pixel coordinates
    if (points.length < 3) return 0;
    let sum = 0;
    for (let i = 0; i < points.length; i++) {
      const j = (i + 1) % points.length;
      sum += points[i].x * points[j].y - points[j].x * points[i].y;
    }
    return Math.abs(sum) / 2;
  }

  // Auto-detect fabric area based on darker shadow region
  function autoDetectFabricFromShadow() {
    if (!image || !offscreenCtx || !maskCtx) {
      overlayMessage.textContent = "Please load an image first.";
      overlayMessage.style.display = "flex";
      return;
    }

    const w = image.width;
    const h = image.height;
    const n = w * h;
    const imageData = offscreenCtx.getImageData(0, 0, w, h);
    const data = imageData.data;

    // First pass: compute grayscale mean and standard deviation
    let sum = 0;
    let sumSq = 0;
    for (let i = 0; i < n; i++) {
      const idx = i * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      sum += gray;
      sumSq += gray * gray;
    }
    const mean = sum / n;
    const variance = Math.max(sumSq / n - mean * mean, 0);
    const std = Math.sqrt(variance);

    // Threshold a bit below the mean to focus on darker (shadow) regions
    const threshold = mean - 0.35 * std;

    // Second pass: build a binary mask of dark pixels
    const maskImageData = maskCtx.createImageData(w, h);
    const maskData = maskImageData.data;
    let darkCount = 0;
    for (let i = 0; i < n; i++) {
      const idx = i * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;

      if (gray < threshold) {
        // Mark as part of fabric shadow: green with alpha
        maskData[idx] = 34;
        maskData[idx + 1] = 197;
        maskData[idx + 2] = 94;
        maskData[idx + 3] = 170; // alpha
        darkCount++;
      } else {
        maskData[idx] = 0;
        maskData[idx + 1] = 0;
        maskData[idx + 2] = 0;
        maskData[idx + 3] = 0;
      }
    }

    maskCtx.putImageData(maskImageData, 0, 0);

    if (darkCount === 0) {
      hasAutoFabricMask = false;
      fabricPixelArea = null;
      fabricPixelAreaEl.textContent = "–";
      fabricRealAreaEl.textContent = "No clear shadow region found";
      overlayMessage.textContent =
        "Could not find a distinct fabric shadow. Try manual outline.";
      overlayMessage.style.display = "flex";
      draw();
      return;
    }

    hasAutoFabricMask = true;
    isMarkingFabric = false;
    fabricPoints = [];

    // The pixel area is simply the count of dark pixels in full-res image
    fabricPixelArea = darkCount;
    fabricPixelAreaEl.textContent = fabricPixelArea.toFixed(0) + " px²";

    if (cm2PerPixel) {
      const areaCm2 = fabricPixelArea * cm2PerPixel;
      fabricRealAreaEl.textContent = areaCm2.toFixed(2) + " cm²";
    } else {
      fabricRealAreaEl.textContent = "Reference not set yet";
    }

    overlayMessage.textContent =
      "Fabric shadow auto-detected. You can reset or use manual outline.";
    overlayMessage.style.display = "flex";
    draw();
  }

  function finalizeFabricPolygon() {
    if (fabricPoints.length < 3) return;
    isMarkingFabric = false;
    closeFabricBtn.disabled = true;

    fabricPixelArea = polygonArea(fabricPoints);
    fabricPixelAreaEl.textContent = fabricPixelArea.toFixed(0) + " px²";

    if (cm2PerPixel) {
      const areaCm2 = fabricPixelArea * cm2PerPixel;
      fabricRealAreaEl.textContent = areaCm2.toFixed(2) + " cm²";
    } else {
      fabricRealAreaEl.textContent = "Reference not set yet";
    }

    overlayMessage.textContent = "Fabric polygon closed. You can reset to start over.";
    overlayMessage.style.display = "flex";
    draw();
  }

  // Event wiring
  function handleImageFileChange(e) {
    const fileList = e.target.files;
    const file = fileList && fileList[0];
    if (!file) return;
    resetAll();
    loadImage(file);
  }

  if (uploadInput) {
    uploadInput.addEventListener("change", handleImageFileChange);
  }
  if (captureInput) {
    captureInput.addEventListener("change", handleImageFileChange);
  }

  referenceShapeSelect.addEventListener("change", updateShapeFields);

  markReferenceBtn.addEventListener("click", () => {
    if (!image) {
      overlayMessage.textContent = "Please load an image first.";
      overlayMessage.style.display = "flex";
      return;
    }
    isMarkingReference = true;
    isMarkingFabric = false;
    overlayMessage.textContent =
      referenceShape === "circle"
        ? "Click the center of the coin, then drag to its edge."
        : "Click and drag to draw a box around your reference rectangle.";
    overlayMessage.style.display = "flex";
  });

  startFabricBtn.addEventListener("click", () => {
    if (!image) {
      overlayMessage.textContent = "Please load an image first.";
      overlayMessage.style.display = "flex";
      return;
    }
    isMarkingReference = false;
    isMarkingFabric = true;
    fabricPoints = [];
    fabricPixelArea = null;
    fabricPixelAreaEl.textContent = "–";
    fabricRealAreaEl.textContent = "–";
    closeFabricBtn.disabled = false;

    overlayMessage.textContent =
      "Click around the fabric edge to add points. Use 'Close Fabric Outline' when done.";
    overlayMessage.style.display = "flex";
    draw();
  });

  autoFabricBtn.addEventListener("click", () => {
    if (!image) {
      overlayMessage.textContent = "Please load an image first.";
      overlayMessage.style.display = "flex";
      return;
    }
    autoDetectFabricFromShadow();
  });

  closeFabricBtn.addEventListener("click", () => {
    finalizeFabricPolygon();
  });

  resetAllBtn.addEventListener("click", () => {
    resetAll();
  });

  // Canvas mouse interaction
  let isDraggingRef = false;

  canvas.addEventListener("mousedown", (e) => {
    if (!image) return;
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) * canvas.width) / rect.width;
    const y = ((e.clientY - rect.top) * canvas.height) / rect.height;
    const imgCoords = canvasToImageCoords(x, y);

    if (isMarkingReference) {
      isDraggingRef = true;
      refStart = imgCoords;
      refEnd = imgCoords;
      draw();
    } else if (isMarkingFabric) {
      fabricPoints.push(imgCoords);
      draw();
    }
  });

  canvas.addEventListener("mousemove", (e) => {
    if (!image) return;
    if (!isDraggingRef) return;
    if (!isMarkingReference) return;

    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) * canvas.width) / rect.width;
    const y = ((e.clientY - rect.top) * canvas.height) / rect.height;
    const imgCoords = canvasToImageCoords(x, y);
    refEnd = imgCoords;
    draw();
  });

  canvas.addEventListener("mouseup", () => {
    if (!image) return;
    if (isDraggingRef && isMarkingReference) {
      isDraggingRef = false;
      computeReferenceAreas();
      overlayMessage.textContent =
        "Reference marked. Now outline the fabric area.";
      overlayMessage.style.display = "flex";
      draw();
    }
  });

  canvas.addEventListener("mouseleave", () => {
    if (!image) return;
    if (isDraggingRef && isMarkingReference) {
      isDraggingRef = false;
      computeReferenceAreas();
      draw();
    }
  });

  // For touch devices: translate basic touches into mouse-like events
  function touchToMouseEvent(type, touchEvent) {
    const touch = touchEvent.touches[0] || touchEvent.changedTouches[0];
    const rect = canvas.getBoundingClientRect();
    const clientX = touch.clientX;
    const clientY = touch.clientY;
    const simulatedEvent = new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX,
      clientY,
    });
    canvas.dispatchEvent(simulatedEvent);
  }

  canvas.addEventListener(
    "touchstart",
    (e) => {
      e.preventDefault();
      touchToMouseEvent("mousedown", e);
    },
    { passive: false }
  );

  canvas.addEventListener(
    "touchmove",
    (e) => {
      e.preventDefault();
      touchToMouseEvent("mousemove", e);
    },
    { passive: false }
  );

  canvas.addEventListener(
    "touchend",
    (e) => {
      e.preventDefault();
      touchToMouseEvent("mouseup", e);
    },
    { passive: false }
  );

  // Initialize
  resetAll();
  updateShapeFields();
})();

