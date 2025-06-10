/** @odoo-module */
import { patch } from "@web/core/utils/patch";
import { PosPrinterService } from "@point_of_sale/app/printer/pos_printer_service";

// Patch the printer service to handle the classList error
patch(PosPrinterService.prototype, {

    /**
     * Override the print method to add error handling for custom receipts
     */
    async print(component, template, options = {}) {
        try {
            return await super.print(component, template, options);
        } catch (error) {
            console.warn("Printer service error:", error);

            // If it's the classList error, try to print with a simplified approach
            if (error.message && error.message.includes('classList')) {
                console.warn("Attempting fallback printing method due to classList error");
                return this._fallbackPrint(component, template, options);
            }
            throw error;
        }
    },

    /**
     * Fallback printing method that avoids classList manipulation
     */
    async _fallbackPrint(component, template, options = {}) {
        try {
            // Create a simple div wrapper without complex DOM manipulation
            const tempDiv = document.createElement('div');
            tempDiv.className = 'pos-receipt-print-fallback';

            // Render the component directly without complex DOM queries
            const renderResult = await this._renderForPrint(component, template, options);

            if (typeof renderResult === 'string') {
                tempDiv.innerHTML = renderResult;
            } else if (renderResult && renderResult.outerHTML) {
                tempDiv.innerHTML = renderResult.outerHTML;
            }

            // Use browser's native print without Odoo's DOM manipulation
            return this._simplePrint(tempDiv.innerHTML);

        } catch (fallbackError) {
            console.error("Fallback printing also failed:", fallbackError);
            // Last resort: show error to user
            this.env.services.notification.add(
                "Receipt printing failed. Please try using the standard receipt template.",
                { type: "warning" }
            );
            return false;
        }
    },

    /**
     * Simple print method that bypasses complex DOM operations
     */
    _simplePrint(htmlContent) {
        try {
            const printWindow = window.open('', '_blank');
            printWindow.document.write(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Receipt</title>
                    <style>
                        body { font-family: monospace; font-size: 12px; margin: 20px; }
                        .pos-receipt { max-width: 300px; margin: 0 auto; }
                        .pos-receipt-right-align { float: right; }
                        .text-center { text-align: center; }
                        table { width: 100%; border-collapse: collapse; }
                        td, th { padding: 2px 0; }
                        @media print {
                            body { margin: 0; font-size: 10px; }
                            .pos-receipt { max-width: none; }
                        }
                    </style>
                </head>
                <body>
                    ${htmlContent}
                    <script>
                        window.onload = function() {
                            window.print();
                            window.close();
                        };
                    </script>
                </body>
                </html>
            `);
            printWindow.document.close();
            return true;
        } catch (error) {
            console.error("Simple print failed:", error);
            return false;
        }
    },

    /**
     * Safe render method that avoids problematic DOM operations
     */
    async _renderForPrint(component, template, options) {
        try {
            // If component has a direct HTML representation, use it
            if (component && typeof component.el === 'object' && component.el.outerHTML) {
                return component.el.outerHTML;
            }

            // Otherwise, try to get the rendered content safely
            if (component && component.__owl__ && component.__owl__.bdom) {
                const content = component.__owl__.bdom.outerHTML || component.__owl__.bdom.innerHTML;
                if (content) return content;
            }

            // Fallback to template rendering if available
            if (template && this.env.qweb) {
                return this.env.qweb.renderToString(template, options.data || {});
            }

            return '<div class="pos-receipt"><div>Receipt content unavailable</div></div>';

        } catch (error) {
            console.warn("Render for print failed:", error);
            return '<div class="pos-receipt"><div>Receipt rendering error</div></div>';
        }
    }
});