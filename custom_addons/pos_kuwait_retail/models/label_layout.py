# -*- coding: utf-8 -*-

import logging
from odoo import models, fields, api

_logger = logging.getLogger(__name__)


class ProductLabelLayout(models.TransientModel):
    _inherit = 'product.label.layout'

    print_format = fields.Selection(
        selection_add=[('dymo_without_price', 'Dymo (No Price)')],
        ondelete={'dymo_without_price': 'set default'}
    )

    def get_total_quantity_from_latest_bills(self):
        """Get total quantities from latest vendor bills for selected products"""
        if not self.product_ids:
            return 0

        total_quantity = 0

        for product in self.product_ids:
            # Find latest posted vendor bill containing this product
            posted_bills = self.env['account.move'].search([
                ('move_type', '=', 'in_invoice'),
                ('state', '=', 'posted'),
                ('invoice_line_ids.product_id', '=', product.id)
            ], order='date desc, id desc', limit=1)

            if posted_bills:
                bill_line = posted_bills.invoice_line_ids.filtered(
                    lambda l: l.product_id.id == product.id and l.quantity > 0
                )
                if bill_line:
                    quantity = int(bill_line[0].quantity)
                    total_quantity += quantity
                    _logger.info(f"Found {product.name} in bill {posted_bills.name}: qty={quantity}")
                else:
                    _logger.info(f"No valid bill lines for {product.name}")
            else:
                _logger.info(f"No posted bills found for {product.name}")

        _logger.info(f"Total label quantity: {total_quantity}")
        return total_quantity

    def _prepare_report_data(self):
        """Handle different print formats"""
        if self.print_format == 'dymo_without_price':
            return 'kuwait_retail_pos.action_report_dymo_without_price', {}
        else:
            return super()._prepare_report_data()