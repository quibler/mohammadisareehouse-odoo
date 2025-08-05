/** @odoo-module **/

import { OrderReceipt } from "@point_of_sale/app/screens/receipt_screen/receipt/order_receipt";
import { patch } from "@web/core/utils/patch";

// Patch the OrderReceipt component to fix CHANGE font size after rendering
patch(OrderReceipt.prototype, {

    // Override the patched method to fix font sizes after component mounts
    setup() {
        super.setup();

        // Add a method to fix CHANGE font size after rendering
        this.fixChangeFontSize = () => {
            // Wait for DOM to be ready
            setTimeout(() => {
                const receiptElement = document.querySelector('.pos-receipt');
                if (receiptElement) {
                    // Find all elements that contain "CHANGE" text
                    const changeElements = Array.from(receiptElement.querySelectorAll('*')).filter(el =>
                        el.textContent && el.textContent.includes('CHANGE')
                    );

                    // Apply 12px font size to CHANGE elements
                    changeElements.forEach(el => {
                        el.style.fontSize = '12px';
                        el.style.fontWeight = '600';
                        console.log('Fixed CHANGE element font size to 12px');
                    });

                    // Also target by class if available
                    const receiptChangeElements = receiptElement.querySelectorAll('.receipt-change, .pos-receipt-amount');
                    receiptChangeElements.forEach(el => {
                        if (el.textContent && el.textContent.includes('CHANGE')) {
                            el.style.fontSize = '12px';
                            el.style.fontWeight = '600';
                            console.log('Fixed CHANGE by class targeting');
                        }
                    });
                }
            }, 100); // Small delay to ensure DOM is ready
        };
    },

    // Call the fix method after the component is mounted
    onMounted() {
        super.onMounted();
        this.fixChangeFontSize();
    },

    // Also call when component is patched/updated
    onPatched() {
        super.onPatched();
        this.fixChangeFontSize();
    }
});