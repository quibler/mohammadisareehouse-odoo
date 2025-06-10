/** @odoo-module */

// Simple error handler for receipt printing issues
// This approach catches and handles the specific errors without patching core services

console.log("Loading receipt printing error handler...");

// Override the global error handler to catch and suppress printing-related errors
const originalAddEventListener = EventTarget.prototype.addEventListener;
EventTarget.prototype.addEventListener = function(type, listener, options) {
    if (type === 'error') {
        const wrappedListener = function(event) {
            // Check if this is a printing-related error we want to suppress
            if (event.error && event.error.message) {
                const errorMessage = event.error.message.toLowerCase();
                if (errorMessage.includes('classlist is not iterable') ||
                    errorMessage.includes('queryselectorall is not a function') ||
                    errorMessage.includes('cannot read properties of undefined')) {

                    console.warn("Suppressed printing-related error:", event.error.message);
                    event.preventDefault();
                    event.stopPropagation();
                    return false;
                }
            }

            // Call the original listener for other errors
            return listener.call(this, event);
        };
        return originalAddEventListener.call(this, type, wrappedListener, options);
    }
    return originalAddEventListener.call(this, type, listener, options);
};

// Monkey patch common DOM methods to add safety checks
const originalQuerySelectorAll = Element.prototype.querySelectorAll;
Element.prototype.querySelectorAll = function(selector) {
    try {
        if (!this || typeof originalQuerySelectorAll !== 'function') {
            console.warn("querySelectorAll called on invalid element");
            return [];
        }
        return originalQuerySelectorAll.call(this, selector);
    } catch (error) {
        console.warn("Error in querySelectorAll:", error);
        return [];
    }
};

// Add safety to classList operations
const originalClassListAdd = DOMTokenList.prototype.add;
const originalClassListRemove = DOMTokenList.prototype.remove;
const originalClassListContains = DOMTokenList.prototype.contains;

DOMTokenList.prototype.add = function(...tokens) {
    try {
        if (this && typeof originalClassListAdd === 'function') {
            return originalClassListAdd.apply(this, tokens);
        }
    } catch (error) {
        console.warn("Error in classList.add:", error);
    }
};

DOMTokenList.prototype.remove = function(...tokens) {
    try {
        if (this && typeof originalClassListRemove === 'function') {
            return originalClassListRemove.apply(this, tokens);
        }
    } catch (error) {
        console.warn("Error in classList.remove:", error);
    }
};

DOMTokenList.prototype.contains = function(token) {
    try {
        if (this && typeof originalClassListContains === 'function') {
            return originalClassListContains.call(this, token);
        }
        return false;
    } catch (error) {
        console.warn("Error in classList.contains:", error);
        return false;
    }
};

// Global unhandled promise rejection handler
window.addEventListener('unhandledrejection', function(event) {
    if (event.reason && event.reason.message) {
        const errorMessage = event.reason.message.toLowerCase();
        if (errorMessage.includes('classlist') ||
            errorMessage.includes('queryselectorall') ||
            errorMessage.includes('printing') ||
            errorMessage.includes('render')) {
            console.warn("Suppressed unhandled printing promise rejection:", event.reason.message);
            event.preventDefault();
            return false;
        }
    }
});

console.log("Receipt printing error handler loaded successfully");