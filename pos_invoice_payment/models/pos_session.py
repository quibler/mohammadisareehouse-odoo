# -*- coding: utf-8 -*-
from odoo import models, fields, api


class PosSession(models.Model):
    _inherit = 'pos.session'

    invoice_payment_ids = fields.One2many(
        'account.payment', 'pos_session_id',
        string='Invoice Payments',
        readonly=True
    )
    invoice_payment_count = fields.Integer(
        string='Invoice Payment Count',
        compute='_compute_invoice_payments'
    )
    invoice_payment_total = fields.Monetary(
        string='Invoice Payment Total',
        compute='_compute_invoice_payments',
        currency_field='currency_id'
    )

    @api.depends('invoice_payment_ids', 'invoice_payment_ids.amount', 'invoice_payment_ids.state')
    def _compute_invoice_payments(self):
        for session in self:
            # Count payments that are posted or paid (paid = reconciled with invoice)
            valid_payments = session.invoice_payment_ids.filtered(lambda p: p.state in ('posted', 'paid'))
            session.invoice_payment_count = len(valid_payments)
            session.invoice_payment_total = sum(valid_payments.mapped('amount'))

    def get_closing_control_data(self):
        """Override to include invoice payment details in closing data."""
        result = super().get_closing_control_data()
        result['invoice_payments_details'] = {
            'quantity': self.invoice_payment_count,
            'amount': self.invoice_payment_total,
        }
        return result
