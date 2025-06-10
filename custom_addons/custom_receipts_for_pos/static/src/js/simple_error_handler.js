/** @odoo-module */

// Enhanced error handler for receipt printing issues on EC2 deployment
// This version adds more aggressive patching for printing and clipboard issues

console.log("Loading enhanced receipt printing error handler for EC2...");

// Immediately patch global error handlers
window.addEventListener('error', function(event) {
    if (event.error && event.error.message) {
        const errorMessage = event.error.message.toLowerCase();
        if (errorMessage.includes('classlist is not iterable') ||
            errorMessage.includes('queryselectorall is not a function') ||
            errorMessage.includes('cannot read properties of undefined') ||
            errorMessage.includes('writetext')) {

            console.warn("Suppressed deployment-related error:", event.error.message);
            event.preventDefault();
            event.stopPropagation();
            return false;
        }
    }
}, true);

// Patch clipboard functionality for non-HTTPS environments
function patchClipboardAPI() {
    // Create a fallback clipboard object for insecure contexts
    if (!navigator.clipboard || !window.isSecureContext) {
        console.warn("Clipboard API not available in insecure context, creating fallback");

        // Create a fallback clipboard implementation
        const fallbackClipboard = {
            writeText: function(text) {
                return new Promise((resolve, reject) => {
                    try {
                        // Try the old document.execCommand method
                        const textArea = document.createElement("textarea");
                        textArea.value = text;
                        textArea.style.position = "fixed";
                        textArea.style.left = "-999999px";
                        textArea.style.top = "-999999px";
                        textArea.style.opacity = "0";

                        document.body.appendChild(textArea);
                        textArea.focus();
                        textArea.select();

                        const successful = document.execCommand('copy');
                        document.body.removeChild(textArea);

                        if (successful) {
                            console.log("Text copied to clipboard using fallback method");
                            resolve();
                        } else {
                            reject(new Error("Copy command failed"));
                        }
                    } catch (error) {
                        console.warn("Fallback clipboard copy failed:", error);
                        reject(error);
                    }
                });
            },

            readText: function() {
                return Promise.reject(new Error("Reading clipboard not supported in insecure context"));
            }
        };

        // Replace the navigator.clipboard if it doesn't exist or is undefined
        if (!navigator.clipboard) {
            Object.defineProperty(navigator, 'clipboard', {
                value: fallbackClipboard,
                writable: false,
                configurable: false
            });
        }
    }
}

// More aggressive DOM patching for printing issues
function patchDOMOperations() {
    // Store original methods
    const originalQuerySelectorAll = Element.prototype.querySelectorAll;
    const originalGetElementsByTagName = Element.prototype.getElementsByTagName;

    // Enhanced querySelectorAll patch
    Element.prototype.querySelectorAll = function(selector) {
        try {
            if (!this || typeof originalQuerySelectorAll !== 'function') {
                console.warn("querySelectorAll called on invalid element");
                return document.createDocumentFragment().children || [];
            }
            return originalQuerySelectorAll.call(this, selector);
        } catch (error) {
            console.warn("Error in querySelectorAll:", error);
            return document.createDocumentFragment().children || [];
        }
    };

    // Enhanced getElementsByTagName patch
    Element.prototype.getElementsByTagName = function(tagName) {
        try {
            if (!this || typeof originalGetElementsByTagName !== 'function') {
                console.warn("getElementsByTagName called on invalid element");
                return [];
            }
            return originalGetElementsByTagName.call(this, tagName);
        } catch (error) {
            console.warn("Error in getElementsByTagName:", error);
            return [];
        }
    };

    // Enhanced classList patching
    const originalAdd = DOMTokenList.prototype.add;
    const originalRemove = DOMTokenList.prototype.remove;
    const originalContains = DOMTokenList.prototype.contains;
    const originalToggle = DOMTokenList.prototype.toggle;

    DOMTokenList.prototype.add = function(...tokens) {
        try {
            if (this && typeof originalAdd === 'function') {
                return originalAdd.apply(this, tokens);
            }
        } catch (error) {
            console.warn("Error in classList.add:", error);
        }
    };

    DOMTokenList.prototype.remove = function(...tokens) {
        try {
            if (this && typeof originalRemove === 'function') {
                return originalRemove.apply(this, tokens);
            }
        } catch (error) {
            console.warn("Error in classList.remove:", error);
        }
    };

    DOMTokenList.prototype.contains = function(token) {
        try {
            if (this && typeof originalContains === 'function') {
                return originalContains.call(this, token);
            }
            return false;
        } catch (error) {
            console.warn("Error in classList.contains:", error);
            return false;
        }
    };

    DOMTokenList.prototype.toggle = function(token, force) {
        try {
            if (this && typeof originalToggle === 'function') {
                return originalToggle.call(this, token, force);
            }
            return false;
        } catch (error) {
            console.warn("Error in classList.toggle:", error);
            return false;
        }
    };
}

// Patch potential printing service issues
function patchPrintingServices() {
    // Try to patch printing-related functions that might cause issues
    const originalPrint = window.print;

    window.print = function() {
        try {
            console.log("Print function called - applying error handling");
            return originalPrint.call(this);
        } catch (error) {
            console.warn("Error in window.print:", error);
            // Try alternative print method
            try {
                document.execCommand('print');
            } catch (fallbackError) {
                console.error("All print methods failed:", fallbackError);
            }
        }
    };
}

// Enhanced unhandled promise rejection handler
window.addEventListener('unhandledrejection', function(event) {
    if (event.reason && event.reason.message) {
        const errorMessage = event.reason.message.toLowerCase();
        if (errorMessage.includes('classlist') ||
            errorMessage.includes('queryselectorall') ||
            errorMessage.includes('printing') ||
            errorMessage.includes('render') ||
            errorMessage.includes('writetext') ||
            errorMessage.includes('clipboard')) {
            console.warn("Suppressed unhandled printing/clipboard promise rejection:", event.reason.message);
            event.preventDefault();
            return false;
        }
    }
});

// Initialize all patches immediately
try {
    patchClipboardAPI();
    patchDOMOperations();
    patchPrintingServices();
    console.log("Enhanced receipt printing error handler loaded successfully for EC2 deployment");
} catch (error) {
    console.error("Error loading enhanced error handler:", error);
}

// Additional patch specifically for EC2 environments
if (typeof window !== 'undefined') {
    // Override any potential undefined property accesses
    const originalGetPropertyDescriptor = Object.getOwnPropertyDescriptor;

    // Add a more robust error boundary for the entire window
    window.addEventListener('beforeunload', function() {
        console.log("Page unloading - cleaning up error handlers");
    });

    // Monkey patch for any missing APIs that might be expected
    if (!window.isSecureContext) {
        console.warn("Running in insecure context - some features may be limited");

        // Add a fake isSecureContext for compatibility
        Object.defineProperty(window, 'isSecureContext', {
            value: false,
            writable: false,
            configurable: false
        });
    }
}

export { patchClipboardAPI, patchDOMOperations, patchPrintingServices };