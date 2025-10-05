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

            // Check if this is a refund order and if the original was invoiced
            const isRefundOrder = this.isRefundOrder(order);
            const shouldInvoiceRefund = isRefundOrder && this.shouldInvoiceRefund(order);

            // Auto-check invoice if customer account payment exists OR if refund of invoiced order
            if ((hasCustomerAccountPayment || shouldInvoiceRefund) && !order.is_to_invoice()) {
                order.set_to_invoice(true);
            }

            // Auto-uncheck invoice if no customer account payment, not a refund requiring invoice, and user hasn't manually set it
            if (!hasCustomerAccountPayment && !shouldInvoiceRefund && order.is_to_invoice() && !order._manually_set_invoice) {
                order.set_to_invoice(false);
            }
        }, 500); // Check every 500ms
    },

    isRefundOrder(order) {
        // Check if any order line is a refund (has refunded_orderline_id)
        const orderlines = order.get_orderlines();
        return orderlines.some(line => line.refunded_orderline_id);
    },

    shouldInvoiceRefund(order) {
        // For refund orders, check if the original order was invoiced
        if (!this.isRefundOrder(order)) {
            return false;
        }

        const orderlines = order.get_orderlines();
        if (orderlines.length === 0) {
            return false;
        }

        // Get the first refunded orderline to find the original order
        const refundedLine = orderlines.find(line => line.refunded_orderline_id);
        if (!refundedLine || !refundedLine.refunded_orderline_id) {
            return false;
        }

        // Try to find the original order using refunded_orderline_id.order_id
        // The refunded_orderline_id is an object with order_id property
        let originalOrderId = null;

        if (refundedLine.refunded_orderline_id.order_id) {
            // If it's an object with order_id
            originalOrderId = refundedLine.refunded_orderline_id.order_id;
        } else if (typeof refundedLine.refunded_orderline_id === 'object') {
            // Try to find order_id in the object
            originalOrderId = refundedLine.refunded_orderline_id.id || refundedLine.refunded_orderline_id.order_id;
        }

        // Try to get the original order directly from models
        if (originalOrderId) {
            const originalOrder = this.pos.models['pos.order']?.get(originalOrderId);
            if (originalOrder) {
                return originalOrder.to_invoice || originalOrder.account_move;
            }
        }

        // Fallback: Check if any orderline has to_invoice property set on the order
        // This means the original order was invoiced
        try {
            if (refundedLine.refunded_orderline_id?.order_id?.to_invoice) {
                return true;
            }
        } catch (e) {
            // Ignore errors
        }

        // If we can't determine, assume it was invoiced for safety
        // (safer to create credit note than to not create one when needed)
        return true;
    },

    // Track manual invoice toggle to prevent auto-unchecking when user manually enables it
    toggleIsToInvoice() {
        const order = this.pos.get_order();
        const hasCustomerAccountPayment = order.payment_ids.some(payment =>
            payment.payment_method_id && payment.payment_method_id.type === 'pay_later'
        );
        const shouldInvoiceRefund = this.isRefundOrder(order) && this.shouldInvoiceRefund(order);

        // If customer account payment exists or this is a refund of invoiced order, keep invoice checked
        if ((hasCustomerAccountPayment || shouldInvoiceRefund) && order.is_to_invoice()) {
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