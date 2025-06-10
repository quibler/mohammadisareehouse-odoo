/** @odoo-module */
import { RenderService } from "@point_of_sale/app/printer/render_service";
import { patch } from "@web/core/utils/patch";

// Patch the render service to handle classList errors during printing
patch(RenderService.prototype, {

    async applyWhenMounted(element, callback) {
        try {
            // Enhanced error checking for element and classList
            if (!element) {
                console.warn("applyWhenMounted: element is null or undefined");
                return;
            }

            // Check if element has classList property and it's not null/undefined
            if (!element.classList) {
                console.warn("applyWhenMounted: element has no classList property", element);
                return;
            }

            // Check if classList is iterable (has the expected methods)
            if (typeof element.classList.add !== 'function' ||
                typeof element.classList.remove !== 'function' ||
                typeof element.classList.contains !== 'function') {
                console.warn("applyWhenMounted: element.classList is not properly formed", element);
                return;
            }

            // Call the original callback if all checks pass
            if (typeof callback === 'function') {
                await callback(element);
            }
        } catch (error) {
            console.error("Error in applyWhenMounted:", error, "Element:", element);
            // Don't throw the error, just log it to prevent printing failures
        }
    },

    async loadAllImages(element) {
        try {
            // Enhanced error checking for DOM element
            if (!element || typeof element.querySelectorAll !== 'function') {
                console.warn("loadAllImages: invalid element provided", element);
                return [];
            }

            const images = element.querySelectorAll("img");
            const imagePromises = Array.from(images).map((img) => {
                return new Promise((resolve) => {
                    // Check if img is a proper HTMLImageElement
                    if (!img || typeof img.addEventListener !== 'function') {
                        console.warn("loadAllImages: invalid image element", img);
                        resolve();
                        return;
                    }

                    if (img.complete) {
                        resolve();
                    } else {
                        const onLoad = () => {
                            img.removeEventListener("load", onLoad);
                            img.removeEventListener("error", onError);
                            resolve();
                        };
                        const onError = () => {
                            img.removeEventListener("load", onLoad);
                            img.removeEventListener("error", onError);
                            console.warn("Failed to load image:", img.src);
                            resolve(); // Resolve anyway to not block printing
                        };

                        img.addEventListener("load", onLoad);
                        img.addEventListener("error", onError);
                    }
                });
            });

            await Promise.all(imagePromises);
        } catch (error) {
            console.error("Error in loadAllImages:", error);
            // Don't throw, just log to prevent printing failures
        }
    },

    async whenMounted(element, callback) {
        try {
            if (!element) {
                console.warn("whenMounted: element is null or undefined");
                return;
            }

            // Use a more robust check for DOM readiness
            if (element.ownerDocument && element.ownerDocument.readyState === 'loading') {
                await new Promise(resolve => {
                    const onReady = () => {
                        element.ownerDocument.removeEventListener('DOMContentLoaded', onReady);
                        resolve();
                    };
                    element.ownerDocument.addEventListener('DOMContentLoaded', onReady);
                });
            }

            await this.applyWhenMounted(element, callback);
        } catch (error) {
            console.error("Error in whenMounted:", error);
            // Don't throw to prevent printing failures
        }
    }
});