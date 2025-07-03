# -*- coding: utf-8 -*-
from odoo import api, fields, models


class SaleOrder(models.Model):
    _inherit = 'sale.order'

    company_currency_id = fields.Many2one(
        string='Company Currency',
        related='company_id.currency_id', readonly=True
    )
    company_rate = fields.Float(
        string='Exchange Rate',
        help='Foreign currency per company currency',
        digits=(12, 6)
    )

    @api.onchange('currency_id')
    def _onchange_currency_id(self):
        """Load last exchange rate when currency changes"""
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
                system_rate = self.env['res.currency']._get_conversion_rate(
                    from_currency=self.company_currency_id,
                    to_currency=self.currency_id,
                    company=self.company_id,
                    date=self.date_order or fields.Date.today(),
                )
                self.company_rate = 1.0 / system_rate if system_rate else 1.0
        else:
            self.company_rate = 0.0

    @api.onchange('company_rate')
    def _onchange_company_rate(self):
        """Update currency rate when manual rate is changed"""
        if self.company_rate > 0 and self.currency_id != self.company_currency_id:
            self._update_currency_rate()

    def _update_currency_rate(self):
        """Update the global currency rate table"""
        if not self.company_rate or not self.currency_id or self.currency_id == self.company_currency_id:
            return

        rate_date = self.date_order.date() if self.date_order else fields.Date.today()

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