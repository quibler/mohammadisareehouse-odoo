# -*- coding: utf-8 -*-
from odoo import api, fields, models


class AccountMoveLine(models.Model):
    _inherit = 'account.move.line'

    # Simple line number - only shown after save
    line_number = fields.Integer(
        string='Line #',
        compute='_compute_line_number',
        help="Sequential line number for invoice lines"
    )

    def _compute_line_number(self):
        """Simple line numbering - only for saved records"""
        for line in self:
            # Only show numbers if the move is saved (has ID) and is a product line
            if (line.move_id and line.move_id.id and
                    line.display_type == 'product'):

                # Get all saved product lines, ordered by sequence
                product_lines = line.move_id.invoice_line_ids.filtered(
                    lambda l: l.display_type == 'product' and l.id
                ).sorted('sequence')

                # Find position and set number
                for index, product_line in enumerate(product_lines, 1):
                    if product_line.id == line.id:
                        line.line_number = index
                        break
                else:
                    line.line_number = 0
            else:
                line.line_number = 0