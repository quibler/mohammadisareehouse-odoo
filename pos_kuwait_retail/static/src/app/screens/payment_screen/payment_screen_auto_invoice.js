/** @odoo-module **/

import { PaymentScreen } from "@point_of_sale/app/screens/payment_screen/payment_screen";
import { patch } from "@web/core/utils/patch";

patch(PaymentScreen.prototype, {
    setup() {
        super.setup();
        // Watch for payment line changes and auto-check invoice for customer account
        this.watchPaymentLines();
    },

    watchPaymentLines() {
        // Check payment lines periodically for customer account payments
        setInterval(() => {
            const order = this.pos.get_order();
            if (!order) return;

            // Check if there's a customer account payment (pay_later type)
            const hasCustomerAccountPayment = order.payment_ids.some(payment =>
                payment.payment_method_id && payment.payment_method_id.type === 'pay_later'
            );

            // Auto-check invoice if customer account payment exists
            if (hasCustomerAccountPayment && !order.is_to_invoice()) {
                order.set_to_invoice(true);
                console.log('Auto-enabled invoice for Customer Account payment');
            }

            // Auto-uncheck invoice if no customer account payment and user hasn't manually set it
            if (!hasCustomerAccountPayment && order.is_to_invoice() && !order._manually_set_invoice) {
                order.set_to_invoice(false);
                console.log('Auto-disabled invoice - no Customer Account payment');
            }
        }, 500); // Check every 500ms
    },

    // Track manual invoice toggle to prevent auto-unchecking when user manually enables it
    toggleIsToInvoice() {
        const order = this.pos.get_order();
        const hasCustomerAccountPayment = order.payment_ids.some(payment =>
            payment.payment_method_id && payment.payment_method_id.type === 'pay_later'
        );

        // If customer account payment exists, keep invoice checked
        if (hasCustomerAccountPayment && order.is_to_invoice()) {
            console.log('Cannot uncheck invoice when using Customer Account payment');
            return; // Don't toggle
        }

        // Mark as manually set when user toggles
        order._manually_set_invoice = !order.is_to_invoice();

        // Use normal toggle
        super.toggleIsToInvoice();
    },

    // Override to disable invoice download
    shouldDownloadInvoice() {
        return false; // Never download invoice
    }
});