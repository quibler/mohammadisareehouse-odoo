# -*- coding: utf-8 -*-
from odoo import api, fields, models, _
import logging

_logger = logging.getLogger(__name__)


class AccountMove(models.Model):
    _inherit = ['account.move', 'account.move.fields.mixin', 'account.move.stock.mixin', 'account.move.cost.mixin']
    _name = 'account.move'

    @api.model
    def default_get(self, fields_list):
        """Override default_get to set default dates for vendor bills"""
        defaults = super().default_get(fields_list)

        # Check if this is a vendor bill context
        move_type = defaults.get('move_type') or self._context.get('default_move_type')

        # Set default dates for vendor bills (in_invoice and in_refund)
        if move_type in ('in_invoice', 'in_refund', 'in_receipt'):
            today = fields.Date.context_today(self)

            # Set default invoice_date (Bill Date) to today only if not already set
            if 'invoice_date' in fields_list and not defaults.get('invoice_date'):
                defaults['invoice_date'] = today

            # Set default date (Accounting Date) to today only if not already set
            if 'date' in fields_list and not defaults.get('date'):
                defaults['date'] = today

        return defaults

    def action_post(self):
        """Override to create stock movements and update costs after posting vendor bills"""
        # Call the original method first
        result = super().action_post()

        # Process vendor bills for auto stock update
        vendor_bills = self.filtered(lambda m: m._should_process_stock())

        _logger.info(f"Found {len(vendor_bills)} vendor bills to process for auto stock update")

        for bill in vendor_bills:
            try:
                _logger.info(f"Processing bill {bill.name} for auto stock update")

                # Check if this is a content change (not first time processing)
                is_content_change = bill.stock_moves_created and bill.stock_processed_hash != bill._compute_bill_content_hash()

                # Update product costs FIRST (before stock movements)
                bill._update_product_costs_from_bill()

                # Create stock movements using proper stock moves
                bill._create_proper_stock_moves()

                # Update tracking fields
                bill.stock_processed_hash = bill._compute_bill_content_hash()
                bill.stock_moves_created = True

                # Post warning if content changed
                if is_content_change:
                    bill._post_discrepancy_warning()
                else:
                    # Clear any previous discrepancy flags for fresh processing
                    bill.has_stock_discrepancy = False
                    bill.stock_discrepancy_details = False

            except Exception as e:
                _logger.error(f"Failed to process bill {bill.name}: {str(e)}")
                # Create a message in the chatter instead of blocking the bill
                bill.message_post(
                    body=f"❌ Error: Failed to automatically process vendor bill. Error: {str(e)}",
                    message_type='comment',
                    subtype_xmlid='mail.mt_note'
                )

        return result

    def button_draft(self):
        """Override to handle stock processing tracking when bill goes to draft"""
        result = super().button_draft()

        # When going to draft, keep the tracking info for comparison
        # Don't clear stock_moves_created or hash - this allows detection of changes
        _logger.info(f"Bill {self.name} set to draft. Stock tracking info preserved for change detection.")

        return result

    def write(self, vals):
        """Override write to check cost consistency on line changes"""
        # Check if invoice lines are being modified
        lines_modified = 'invoice_line_ids' in vals

        result = super().write(vals)

        # If lines were modified and bill is posted, check cost consistency
        if lines_modified:
            posted_bills = self.filtered(lambda m: m.move_type == 'in_invoice' and m.state == 'posted')
            for bill in posted_bills:
                # Only update if this bill is still the latest for its products
                bill._update_product_costs_from_bill()

        return result