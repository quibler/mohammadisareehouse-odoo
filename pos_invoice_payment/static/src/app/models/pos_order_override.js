import { PosOrder } from "@point_of_sale/app/models/pos_order";
import { patch } from "@web/core/utils/patch";

patch(PosOrder.prototype, {
    /**
     * Override is_paid to allow partial payments for invoice payment orders
     * For invoice payments, any amount > 0 is valid (partial payment allowed)
     */
    is_paid() {
        if (this.isInvoicePaymentOrder) {
            // For invoice payments, allow validation if any payment is made
            return this.get_total_paid() > 0;
        }
        return super.is_paid();
    },

    /**
     * Override _isValidEmptyOrder to allow invoice payment orders to validate
     * Invoice payment orders always have a product line, so this should return true
     */
    _isValidEmptyOrder() {
        if (this.isInvoicePaymentOrder) {
            // Invoice payment orders are always valid if they have payment
            return this.payment_ids.length > 0;
        }
        return super._isValidEmptyOrder();
    },

    /**
     * Override export_for_printing to inject invoice payment data for receipt
     * Uses existing pos_kuwait_retail OrderReceipt template
     * For partial payments, show actual payment amount (not order total)
     */
    export_for_printing(baseUrl, headerData) {
        const result = super.export_for_printing(baseUrl, headerData);

        // Check if this is an invoice payment order
        if (this.isInvoicePaymentOrder && this.invoicePaymentData) {
            // Get actual payment amount from payment lines (not order total)
            const actualPayment = this.get_total_paid();

            // Inject invoice reference and origin for display on receipt
            result.invoice_reference = this.invoicePaymentData.invoice_name;
            result.invoice_origin = this.invoicePaymentData.invoice_origin || false;

            // Override orderlines to show actual payment amount, not the product line amount
            result.orderlines = [{
                productName: `Payment for ${this.invoicePaymentData.invoice_name}`,
                qty: 1,
                price: actualPayment.toFixed(3),
                unitPrice: actualPayment.toFixed(3),
            }];

            // Override totals to show actual payment amount
            result.amount_total = actualPayment;
            result.total_with_tax = actualPayment;
            result.total_paid = actualPayment;
            result.total_without_tax = actualPayment;
            result.amount_tax = 0;

            // Update taxTotals for pos_kuwait_retail template
            if (result.taxTotals) {
                result.taxTotals.order_total = actualPayment;
                result.taxTotals.order_subtotal_no_discount = actualPayment;
                result.taxTotals.amount_untaxed = actualPayment;
                result.taxTotals.amount_total = actualPayment;
            }

            // Update paymentlines to match actual payment
            if (result.paymentlines && result.paymentlines.length > 0) {
                result.paymentlines = result.paymentlines.map(line => ({
                    ...line,
                    amount: actualPayment
                }));
            }

            // Hide change for invoice payments (should always be 0 or close to 0)
            result.show_change = false;
            result.order_change = 0;
            result.change = 0;
        }

        return result;
    },
});
