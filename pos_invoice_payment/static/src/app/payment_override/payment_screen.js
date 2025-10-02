import { PaymentScreen } from "@point_of_sale/app/screens/payment_screen/payment_screen";
import { patch } from "@web/core/utils/patch";
import { _t } from "@web/core/l10n/translation";
import { AlertDialog } from "@web/core/confirmation_dialog/confirmation_dialog";

patch(PaymentScreen.prototype, {
    async validateOrder(isForceValidate) {
        const currentOrder = this.currentOrder;

        // Check if this is an invoice payment
        if (currentOrder.invoicePaymentData) {
            return await this.validateInvoicePayment();
        }

        // Call parent method for normal POS orders
        return await super.validateOrder(isForceValidate);
    },

    async validateInvoicePayment() {
        const currentOrder = this.currentOrder;
        const invoiceData = currentOrder.invoicePaymentData;

        // Validate that we have payment lines
        if (this.paymentLines.length === 0) {
            this.dialog.add(AlertDialog, {
                title: _t("No Payment Method"),
                body: _t("Please select a payment method."),
            });
            return;
        }

        // Calculate total payment amount
        const totalPayment = this.paymentLines.reduce(
            (sum, line) => sum + line.amount,
            0
        );

        // Validate payment amount doesn't exceed invoice amount due
        if (totalPayment > invoiceData.amount_due + 0.01) { // Small tolerance for rounding
            this.dialog.add(AlertDialog, {
                title: _t("Payment Exceeds Due Amount"),
                body: _t(
                    "Payment amount (%s) cannot exceed the invoice due amount (%s)",
                    this.env.utils.formatCurrency(totalPayment),
                    this.env.utils.formatCurrency(invoiceData.amount_due)
                ),
            });
            return;
        }

        if (totalPayment <= 0) {
            this.dialog.add(AlertDialog, {
                title: _t("Invalid Payment Amount"),
                body: _t("Payment amount must be greater than zero."),
            });
            return;
        }

        try {
            // Register payment via backend
            const paymentLine = this.paymentLines[0]; // For invoice payments, typically one payment line
            const paymentResult = await this.env.services.orm.call(
                "pos.invoice.payment",
                "register_payment",
                [
                    invoiceData.invoice_id,
                    totalPayment,
                    paymentLine.payment_method_id.id,
                    this.pos.session.id,
                ]
            );

            // Store payment result for receipt printing
            currentOrder.invoicePaymentResult = paymentResult;

            // Clear invoice payment data
            delete currentOrder.invoicePaymentData;
            delete currentOrder.invoicePaymentResult;

            // Clear payment lines
            this.paymentLines.forEach(line => line.delete());

            // Show success notification with payment details
            const message = _t(
                "Payment registered: %s %s paid for invoice %s. Remaining: %s %s",
                paymentResult.currency_symbol,
                paymentResult.amount_paid.toFixed(3),
                paymentResult.invoice_name,
                paymentResult.currency_symbol,
                paymentResult.remaining_balance.toFixed(3)
            );
            this.notification.add(message, { type: "success" });

            // Return to invoice screen
            this.pos.showScreen("InvoiceScreen");
        } catch (error) {
            console.error("Error registering invoice payment:", error);
            this.dialog.add(AlertDialog, {
                title: _t("Payment Error"),
                body: _t("Failed to register payment: %s", error.message || error),
            });
        }
    },
});
