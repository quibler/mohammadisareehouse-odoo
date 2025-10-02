# -*- coding: utf-8 -*-
from odoo import models, fields, api, _
from odoo.exceptions import UserError, ValidationError


class PosInvoicePayment(models.TransientModel):
    _name = 'pos.invoice.payment'
    _description = 'POS Invoice Payment Handler'

    @api.model
    def get_customer_invoices(self, search_term=None, payment_state_filter=None):
        """
        Fetch customer invoices for POS interface

        :param search_term: Search by customer name or invoice number
        :param payment_state_filter: Filter by payment state ('not_paid', 'partial', 'all')
        :return: List of invoice dictionaries
        """
        domain = [
            ('move_type', '=', 'out_invoice'),
            ('state', '=', 'posted'),
        ]

        # Filter by payment state
        if payment_state_filter == 'not_paid':
            domain.append(('payment_state', '=', 'not_paid'))
        elif payment_state_filter == 'partial':
            domain.append(('payment_state', '=', 'partial'))
        elif not payment_state_filter or payment_state_filter == 'unpaid_partial':
            domain.append(('payment_state', 'in', ['not_paid', 'partial']))
        # 'all' shows everything including paid

        # Search by customer name or invoice number
        if search_term:
            domain = ['&'] + domain + [
                '|',
                ('name', 'ilike', search_term),
                ('partner_id.name', 'ilike', search_term)
            ]

        invoices = self.env['account.move'].search(
            domain,
            order='invoice_date desc, name desc',
            limit=100
        )

        return [{
            'id': inv.id,
            'name': inv.name,
            'partner_id': inv.partner_id.id,
            'partner_name': inv.partner_id.name,
            'invoice_date': inv.invoice_date.isoformat() if inv.invoice_date else False,
            'date_due': inv.invoice_date_due.isoformat() if inv.invoice_date_due else False,
            'amount_total': inv.amount_total,
            'amount_residual': inv.amount_residual,
            'amount_paid': inv.amount_total - inv.amount_residual,
            'payment_state': inv.payment_state,
            'currency_id': inv.currency_id.id,
            'currency_symbol': inv.currency_id.symbol,
            'line_ids': [{
                'product_name': line.product_id.display_name if line.product_id else line.name,
                'quantity': line.quantity,
                'price_unit': line.price_unit,
                'price_subtotal': line.price_subtotal,
            } for line in inv.invoice_line_ids.filtered(lambda l: not l.display_type)],
        } for inv in invoices]

    @api.model
    def register_payment(self, invoice_id, amount, pos_payment_method_id, pos_session_id):
        """
        Register payment for an invoice using POS payment method

        :param invoice_id: ID of the invoice to pay
        :param amount: Payment amount
        :param pos_payment_method_id: POS payment method ID
        :param pos_session_id: Current POS session ID
        :return: Payment details dictionary
        """
        invoice = self.env['account.move'].browse(invoice_id)
        pos_method = self.env['pos.payment.method'].browse(pos_payment_method_id)
        pos_session = self.env['pos.session'].browse(pos_session_id)

        # Validation
        if not invoice.exists() or invoice.move_type != 'out_invoice':
            raise ValidationError(_('Invalid invoice'))

        if invoice.state != 'posted':
            raise ValidationError(_('Invoice must be posted'))

        if amount <= 0:
            raise ValidationError(_('Payment amount must be greater than zero'))

        if amount > invoice.amount_residual:
            raise ValidationError(_(
                'Payment amount (%(amount)s) cannot exceed remaining balance (%(residual)s)',
                amount=amount,
                residual=invoice.amount_residual
            ))

        if not pos_method.exists():
            raise ValidationError(_('Invalid payment method'))

        if not pos_session.exists() or pos_session.state != 'opened':
            raise ValidationError(_('POS session must be opened'))

        # Create payment using Odoo's standard account.payment model
        payment_vals = {
            'partner_id': invoice.partner_id.id,
            'amount': amount,
            'payment_type': 'inbound',
            'partner_type': 'customer',
            'journal_id': pos_method.journal_id.id,
            'date': fields.Date.context_today(self),
            'payment_reference': 'POS Payment for %s (Session: %s)' % (invoice.name, pos_session.name),
            'currency_id': invoice.currency_id.id,
        }

        payment = self.env['account.payment'].create(payment_vals)

        # Post the payment - this creates the journal entry and line_ids
        payment.action_post()

        # Reconcile payment with invoice
        # After posting, payment.move_id contains the journal entry with line_ids
        if payment.move_id and payment.move_id.line_ids:
            # Find the receivable lines to reconcile
            invoice_receivable_lines = invoice.line_ids.filtered(
                lambda l: l.account_id.account_type == 'asset_receivable' and not l.reconciled
            )
            payment_receivable_lines = payment.move_id.line_ids.filtered(
                lambda l: l.account_id.account_type == 'asset_receivable' and not l.reconciled
            )

            if invoice_receivable_lines and payment_receivable_lines:
                (invoice_receivable_lines + payment_receivable_lines).reconcile()
                # Link payment to invoice for the payment widget
                invoice.matched_payment_ids += payment

        # Refresh invoice to get updated amount_residual
        invoice.invalidate_recordset(['amount_residual', 'payment_state'])

        return {
            'payment_id': payment.id,
            'payment_name': payment.name,
            'payment_date': payment.date.isoformat(),
            'amount_paid': amount,
            'remaining_balance': invoice.amount_residual,
            'payment_state': invoice.payment_state,
            'invoice_name': invoice.name,
            'partner_name': invoice.partner_id.name,
            'currency_symbol': invoice.currency_id.symbol,
        }

    @api.model
    def get_invoice_details(self, invoice_id):
        """
        Get detailed information for a specific invoice

        :param invoice_id: ID of the invoice
        :return: Invoice details dictionary
        """
        invoice = self.env['account.move'].browse(invoice_id)

        if not invoice.exists():
            raise ValidationError(_('Invoice not found'))

        # Get payment history
        payments = []
        for payment in invoice._get_reconciled_payments():
            payments.append({
                'name': payment.name,
                'date': payment.date.isoformat() if payment.date else False,
                'amount': payment.amount,
                'journal_name': payment.journal_id.name,
            })

        return {
            'id': invoice.id,
            'name': invoice.name,
            'partner_name': invoice.partner_id.name,
            'invoice_date': invoice.invoice_date.isoformat() if invoice.invoice_date else False,
            'date_due': invoice.invoice_date_due.isoformat() if invoice.invoice_date_due else False,
            'amount_total': invoice.amount_total,
            'amount_residual': invoice.amount_residual,
            'amount_paid': invoice.amount_total - invoice.amount_residual,
            'payment_state': invoice.payment_state,
            'currency_symbol': invoice.currency_id.symbol,
            'payments': payments,
        }
