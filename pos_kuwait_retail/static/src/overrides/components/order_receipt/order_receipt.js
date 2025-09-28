/** @odoo-module **/

import { OrderReceipt } from "@point_of_sale/app/screens/receipt_screen/receipt/order_receipt";
import { patch } from "@web/core/utils/patch";

patch(OrderReceipt.prototype, {
    /**
     * Convert English numerals to Arabic numerals
     * @param {string} text - Text containing English numerals
     * @returns {string} Text with Arabic numerals
     */
    convertToArabicNumerals(text) {
        const arabicNumerals = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
        return text.toString().replace(/[0-9]/g, (digit) => arabicNumerals[parseInt(digit)]);
    },

    /**
     * Convert only numeric values to Arabic numerals (no currency symbols)
     * @param {string} text - Text containing English numerals and possibly currency symbols
     * @returns {string} Only the numeric part with Arabic numerals
     */
    convertToArabicNumeralsOnly(text) {
        // Extract only numeric values (digits, dots, commas) from the text
        // Remove any leading/trailing dots or commas that might appear from extraction
        const numericOnly = text.toString().replace(/[^\d.,]/g, '').replace(/^[.,]+|[.,]+$/g, '');
        return this.convertToArabicNumerals(numericOnly);
    },

    /**
     * Enhanced formatCurrency that includes Arabic numerals without currency symbols
     * @param {string|number} amount - The amount to format
     * @returns {string} Formatted currency with Arabic numerals in parentheses (no currency symbols in Arabic)
     */
    formatCurrency(amount) {
        const formatted = this.props.formatCurrency(amount);
        const arabicFormatted = this.convertToArabicNumeralsOnly(formatted);
        return `${formatted} (${arabicFormatted})`;
    }
});