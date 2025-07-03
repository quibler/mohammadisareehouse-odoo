# -*- coding: utf-8 -*-
from odoo import api, fields, models


class AccountMove(models.Model):
    _inherit = 'account.move'

    company_rate = fields.Float(
        string='Exchange Rate',
        help='Foreign currency per company currency',
        digits=(12, 6)
    )

    # New computed fields for company currency totals
    amount_total_company_currency = fields.Monetary(
        string='Total (Company Currency)',
        compute='_compute_company_currency_totals',
        currency_field='company_currency_id',
        help='Total amount in company currency'
    )
    amount_untaxed_company_currency = fields.Monetary(
        string='Untaxed Amount (Company Currency)',
        compute='_compute_company_currency_totals',
        currency_field='company_currency_id',
        help='Untaxed amount in company currency'
    )
    amount_tax_company_currency = fields.Monetary(
        string='Tax (Company Currency)',
        compute='_compute_company_currency_totals',
        currency_field='company_currency_id',
        help='Tax amount in company currency'
    )

    @api.depends('amount_total', 'amount_untaxed', 'amount_tax', 'company_rate', 'currency_id', 'company_currency_id')
    def _compute_company_currency_totals(self):
        """Compute totals in company currency based on manual exchange rate"""
        for move in self:
            if move.currency_id and move.currency_id != move.company_currency_id and move.company_rate > 0:
                # Convert using manual exchange rate
                conversion_rate = 1.0 / move.company_rate
                move.amount_total_company_currency = move.amount_total * conversion_rate
                move.amount_untaxed_company_currency = move.amount_untaxed * conversion_rate
                move.amount_tax_company_currency = move.amount_tax * conversion_rate
            elif move.currency_id == move.company_currency_id:
                # Same currency, no conversion needed
                move.amount_total_company_currency = move.amount_total
                move.amount_untaxed_company_currency = move.amount_untaxed
                move.amount_tax_company_currency = move.amount_tax
            else:
                # Use standard Odoo conversion if no manual rate
                move.amount_total_company_currency = move.currency_id._convert(
                    move.amount_total, move.company_currency_id, move.company_id,
                    move.date or fields.Date.today()
                )
                move.amount_untaxed_company_currency = move.currency_id._convert(
                    move.amount_untaxed, move.company_currency_id, move.company_id,
                    move.date or fields.Date.today()
                )
                move.amount_tax_company_currency = move.currency_id._convert(
                    move.amount_tax, move.company_currency_id, move.company_id,
                    move.date or fields.Date.today()
                )

    @api.onchange('currency_id')
    def _onchange_currency_id(self):
        """Load last exchange rate when currency changes - vendor bills only"""
        # Only apply to vendor bills
        if self.move_type not in ('in_invoice', 'in_refund', 'in_receipt'):
            return

        if self.currency_id and self.currency_id != self.company_currency_id:
            # Get the latest rate for this currency
            latest_rate = self.env['res.currency.rate'].search([
                ('currency_id', '=', self.currency_id.id),
                ('company_id', '=', self.company_id.id)
            ], order='name desc', limit=1)

            if latest_rate:
                self.company_rate = latest_rate.company_rate
            else:
                # Fallback to system rate
                try:
                    system_rate = self.env['res.currency']._get_conversion_rate(
                        from_currency=self.company_currency_id,
                        to_currency=self.currency_id,
                        company=self.company_id,
                        date=self.date or fields.Date.today(),
                    )
                    self.company_rate = 1.0 / system_rate if system_rate else 1.0
                except:
                    self.company_rate = 1.0
        else:
            self.company_rate = 0.0

    @api.onchange('company_rate')
    def _onchange_company_rate(self):
        """Update currency rate when manual rate is changed - vendor bills only"""
        # Only apply to vendor bills
        if self.move_type not in ('in_invoice', 'in_refund', 'in_receipt'):
            return

        if self.company_rate > 0 and self.currency_id != self.company_currency_id:
            self._update_currency_rate()

    def _update_currency_rate(self):
        """Update the global currency rate table"""
        if not self.company_rate or not self.currency_id or self.currency_id == self.company_currency_id:
            return

        rate_date = self.date or fields.Date.today()

        existing_rate = self.env['res.currency.rate'].search([
            ('currency_id', '=', self.currency_id.id),
            ('name', '=', rate_date),
            ('company_id', '=', self.company_id.id)
        ])

        rate_values = {
            'company_rate': self.company_rate,
        }

        if existing_rate:
            existing_rate.write(rate_values)
        else:
            rate_values.update({
                'currency_id': self.currency_id.id,
                'name': rate_date,
                'company_id': self.company_id.id,
            })
            self.env['res.currency.rate'].create(rate_values)