# -*- coding: utf-8 -*-
from odoo import api, fields, models, _
from odoo.exceptions import UserError
import logging
import hashlib

_logger = logging.getLogger(__name__)


class AccountMoveStock(models.AbstractModel):
    """Mixin for AccountMove stock-related functionality"""
    _name = 'account.move.stock.mixin'
    _description = 'Account Move Stock Operations Mixin'

    def _compute_bill_content_hash(self):
        """Compute a hash of the bill content to detect changes (excluding vendor)"""
        self.ensure_one()

        # Get stockable lines for hash computation
        stockable_lines = self.invoice_line_ids.filtered(
            lambda line: line.product_id
                         and line.product_id.type in ['product', 'consu']
                         and line.quantity > 0
                         and (line.display_type == 'product' or not line.display_type)
        )

        # Create a string representation of the relevant bill data (no vendor name)
        hash_data = f"{self.name}|"
        for line in stockable_lines.sorted('id'):  # Sort for consistency
            hash_data += f"{line.product_id.id}:{line.quantity}:{line.price_unit}|"

        return hashlib.md5(hash_data.encode()).hexdigest()

    def _should_process_stock(self):
        """Check if stock should be processed for this bill"""
        self.ensure_one()

        if self.move_type != 'in_invoice' or self.state != 'posted':
            return False

        # Get current content hash
        current_hash = self._compute_bill_content_hash()

        # If no stock has been processed yet, process it
        if not self.stock_moves_created:
            return True

        # If content has changed, process new stock and warn about discrepancy
        if self.stock_processed_hash != current_hash:
            _logger.warning(
                f"Bill content changed for {self.name}. "
                f"Previous hash: {self.stock_processed_hash}, New hash: {current_hash}")
            return True

        return False

    def _get_stockable_products_summary(self):
        """Get a summary of stockable products for warning message"""
        stockable_lines = self.invoice_line_ids.filtered(
            lambda line: line.product_id
                         and line.product_id.type in ['product', 'consu']
                         and line.quantity > 0
                         and (line.display_type == 'product' or not line.display_type)
        )

        summary_lines = []
        for line in stockable_lines:
            summary_lines.append(f"• {line.product_id.name}: {line.quantity} {line.product_uom_id.name}")

        return "\n".join(summary_lines)

    def _post_discrepancy_warning(self):
        """Post a clear warning message about stock discrepancy"""
        self.ensure_one()

        # Get affected products summary
        products_summary = self._get_stockable_products_summary()
        picking_count = len(self.auto_stock_picking_ids)

        # Create clear, actionable warning message
        warning_message = f"""⚠️ STOCK DISCREPANCY DETECTED

This vendor bill was modified after stock moves were already created, resulting in duplicate inventory movements.

CURRENT SITUATION:
• Total stock pickings created: {picking_count}
• Products with duplicate moves: 
{products_summary}

AUTOMATIC RESOLUTION:
Click the "Resolve Stock Discrepancy" button to automatically fix this by reverting all previous stock moves except the most recent one.

This will clean up your inventory and eliminate duplicate stock movements."""

        # Store details for the resolution process
        self.stock_discrepancy_details = f"""Stock discrepancy detected for vendor bill {self.name}.

The bill content changed after stock moves were created.
Current picking count: {picking_count}
Products affected: {products_summary.replace('• ', '').replace(chr(10), ', ')}"""

        self.has_stock_discrepancy = True

        self.message_post(
            body=warning_message,
            message_type='comment',
            subtype_xmlid='mail.mt_note'
        )

        _logger.warning(f"Stock discrepancy detected for bill {self.name}. {picking_count} pickings exist. Resolution required.")

    def action_view_auto_stock_pickings(self):
        """Action to view all auto-created stock pickings"""
        self.ensure_one()
        if not self.auto_stock_picking_ids:
            return {
                'type': 'ir.actions.client',
                'tag': 'display_notification',
                'params': {
                    'type': 'warning',
                    'message': _('No stock pickings found for this vendor bill.'),
                }
            }

        if len(self.auto_stock_picking_ids) == 1:
            return {
                'type': 'ir.actions.act_window',
                'name': _('Auto Stock Picking'),
                'res_model': 'stock.picking',
                'view_mode': 'form',
                'res_id': self.auto_stock_picking_ids[0].id,
                'target': 'current',
                'views': [(False, 'form')],
            }
        else:
            return {
                'type': 'ir.actions.act_window',
                'name': _('Auto Stock Pickings'),
                'res_model': 'stock.picking',
                'view_mode': 'list,form',
                'domain': [('id', 'in', self.auto_stock_picking_ids.ids)],
                'target': 'current',
                'views': [(False, 'list'), (False, 'form')],
                'context': {'contact_display': 'partner_address'},
            }

    def action_resolve_stock_discrepancy(self):
        """Directly resolve stock discrepancy by reverting all previous stock moves except the last one"""
        self.ensure_one()

        if not self.has_stock_discrepancy:
            raise UserError(_("No stock discrepancy found for this vendor bill."))

        if not self.env.user.has_group('stock.group_stock_manager'):
            raise UserError(_("Only stock managers can resolve stock discrepancies."))

        # FIXED: Changed auto_stock_pickup_ids to auto_stock_picking_ids
        all_done_pickings = self.auto_stock_picking_ids.filtered(
            lambda p: p.state == 'done'
        ).sorted('create_date', reverse=True)

        _logger.info(
            f"Resolving discrepancy for {self.name}. Found {len(all_done_pickings)} done pickings: {[p.name for p in all_done_pickings]}")

        if len(all_done_pickings) <= 1:
            # Clear discrepancy if there's only one picking
            self.write({
                'has_stock_discrepancy': False,
                'stock_discrepancy_details': False,
            })
            return {
                'type': 'ir.actions.client',
                'tag': 'display_notification',
                'params': {
                    'type': 'info',
                    'message': 'Only one stock picking exists - no previous moves to revert.',
                }
            }

        # Get all previous pickings (all except the first/newest one)
        previous_pickings = all_done_pickings[1:]
        kept_picking = all_done_pickings[0]

        _logger.info(f"Will keep picking: {kept_picking.name}, will revert: {[p.name for p in previous_pickings]}")

        # Process each previous picking individually
        return_pickings = []
        failed_pickings = []

        for picking in previous_pickings:
            try:
                return_picking = self._create_simple_return_picking(picking)
                return_pickings.append(return_picking)
                _logger.info(
                    f"Successfully created and processed return picking {return_picking.name} for {picking.name}")
            except Exception as e:
                _logger.error(f"Failed to create return for picking {picking.name}: {str(e)}")
                failed_pickings.append((picking.name, str(e)))

        if not return_pickings and failed_pickings:
            error_details = "\n".join([f"• {name}: {error}" for name, error in failed_pickings])
            raise UserError(_("Failed to create any return pickings:\n\n%s") % error_details)

        # Log successful resolution in chatter
        picking_names = [p.name for p in return_pickings]

        success_message = f"""✅ Stock discrepancy resolved successfully!

    Reverted previous stock moves to eliminate duplicates:
    • Kept most recent picking: {kept_picking.name}
    • Reverted {len(return_pickings)} previous picking{'s' if len(return_pickings) != 1 else ''}: {', '.join(picking_names)}

    Your inventory is now clean with only the latest stock moves active."""

        if failed_pickings:
            failure_details = "\n".join([f"• {name}: {error}" for name, error in failed_pickings])
            success_message += f"\n\n⚠️ Some pickings could not be reverted:\n{failure_details}"

        self.message_post(
            body=success_message,
            message_type='comment',
            subtype_xmlid='mail.mt_note'
        )

        # Clear discrepancy flags
        self.write({
            'has_stock_discrepancy': False,
            'stock_discrepancy_details': False,
        })

        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'type': 'success',
                'message': f'Stock discrepancy resolved! Reverted {len(return_pickings)} previous stock moves.',
            }
        }

    def _create_simple_return_picking(self, original_picking):
        """Create a return picking using a simpler, more direct approach"""
        _logger.info(f"Creating simple return picking for {original_picking.name}")

        if original_picking.state != 'done':
            raise UserError(_("Cannot return picking %s - not in done state") % original_picking.name)

        # Get return type
        return_type = original_picking.picking_type_id.return_picking_type_id
        if not return_type:
            # If no specific return type, use outgoing type to reverse the incoming
            return_type = self.env['stock.picking.type'].search([
                ('code', '=', 'outgoing'),
                ('warehouse_id', '=', original_picking.picking_type_id.warehouse_id.id)
            ], limit=1)

        if not return_type:
            raise UserError(_("No return picking type found for %s") % original_picking.name)

        # Create return picking manually
        return_vals = {
            'picking_type_id': return_type.id,
            'location_id': original_picking.location_dest_id.id,  # Reverse: dest becomes source
            'location_dest_id': original_picking.location_id.id,  # Reverse: source becomes dest
            'origin': f"Return of {original_picking.name}",
            'partner_id': original_picking.partner_id.id,
            'company_id': original_picking.company_id.id,
            'return_id': original_picking.id,
            'state': 'draft',
        }

        return_picking = self.env['stock.picking'].create(return_vals)
        _logger.info(f"Created return picking {return_picking.name}")

        # Create return moves for each original move
        return_moves = []
        for move in original_picking.move_ids.filtered(lambda m: m.state == 'done' and m.quantity > 0):
            return_move_vals = {
                'name': f"Return: {move.product_id.name}",
                'product_id': move.product_id.id,
                'product_uom_qty': move.quantity,  # Return the actual delivered quantity
                'product_uom': move.product_uom.id,
                'picking_id': return_picking.id,
                'location_id': original_picking.location_dest_id.id,
                'location_dest_id': original_picking.location_id.id,
                'origin_returned_move_id': move.id,
                'to_refund': True,
                'state': 'draft',
                'company_id': original_picking.company_id.id,
                'picking_type_id': return_type.id,
            }

            return_move = self.env['stock.move'].create(return_move_vals)
            return_moves.append(return_move)
            _logger.info(f"Created return move for {move.product_id.name}, qty: {move.quantity}")

        if not return_moves:
            return_picking.unlink()
            raise UserError(_("No returnable moves found in %s") % original_picking.name)

        # Process the return picking
        return_picking.action_confirm()
        return_picking.action_assign()

        # Set move line quantities for validation
        for move in return_picking.move_ids:
            for move_line in move.move_line_ids:
                if move_line.quantity == 0:
                    move_line.quantity = move_line.reserved_qty

        return_picking.button_validate()

        _logger.info(f"Return picking {return_picking.name} processed successfully")
        return return_picking

    def _create_proper_stock_moves(self):
        """Create proper stock moves with full traceability - Odoo Standard Way"""
        self.ensure_one()

        _logger.info(f"Starting proper stock moves creation for bill {self.name}")

        # Check if this is a vendor bill (account.move.move_type)
        if self.move_type != 'in_invoice':
            _logger.info(f"Bill {self.name} is not a vendor bill, skipping")
            return

        # Filter stockable products only
        stockable_lines = self.invoice_line_ids.filtered(
            lambda line: line.product_id
                         and line.product_id.type in ['product', 'consu']
                         and line.quantity > 0
                         and (line.display_type == 'product' or not line.display_type)
        )

        _logger.info(f"Found {len(stockable_lines)} stockable lines in bill {self.name}")

        if not stockable_lines:
            _logger.info(f"No stockable products found in bill {self.name}, skipping")
            return

        # Get incoming picking type
        picking_type = self.env['stock.picking.type'].search([
            ('code', '=', 'incoming'),
            ('warehouse_id.company_id', '=', self.company_id.id)
        ], limit=1)

        if not picking_type:
            raise UserError(_("No incoming picking type found for company %s") % self.company_id.name)

        # Create stock picking - Set proper move_type for stock.picking
        picking_vals = {
            'picking_type_id': picking_type.id,
            'location_id': self.partner_id.property_stock_supplier.id,
            'location_dest_id': picking_type.default_location_dest_id.id,
            'origin': f"Vendor Bill: {self.name}",
            'partner_id': self.partner_id.id,
            'company_id': self.company_id.id,
            'move_type': 'direct',  # Set proper stock.picking move_type
            'vendor_bill_id': self.id,  # Link back to vendor bill
        }

        picking = self.env['stock.picking'].create(picking_vals)
        _logger.info(f"Created picking {picking.name}")

        # Create stock moves for each line
        moves_created = []
        for line in stockable_lines:
            move_vals = {
                'name': f"{line.product_id.name} (from {self.name})",
                'product_id': line.product_id.id,
                'product_uom_qty': line.quantity,
                'product_uom': line.product_uom_id.id,
                'location_id': self.partner_id.property_stock_supplier.id,
                'location_dest_id': picking_type.default_location_dest_id.id,
                'picking_id': picking.id,
                'origin': f"Vendor Bill: {self.name}",
                'company_id': self.company_id.id,
                'to_refund': True,  # Allow returns if needed
                'price_unit': line.price_unit,  # For proper valuation
            }

            move = self.env['stock.move'].create(move_vals)
            moves_created.append(move)

            _logger.info(f"Created move for product {line.product_id.name}, qty: {line.quantity}")

        # Process the picking through standard Odoo workflow
        picking.action_confirm()
        picking.action_assign()

        # For Odoo 18, validate the picking directly without immediate_transfer wizard
        picking.button_validate()

        _logger.info(f"Successfully processed picking {picking.name} with {len(moves_created)} moves")

        return picking

    def reset_stock_processing(self):
        """Reset stock processing flags - use with caution"""
        self.ensure_one()

        if not self.env.user.has_group('stock.group_stock_manager'):
            raise UserError(_("Only stock managers can reset stock processing flags."))

        self.write({
            'stock_moves_created': False,
            'stock_processed_hash': False,
            'has_stock_discrepancy': False,
            'stock_discrepancy_details': False,
        })

        self.message_post(
            body="Stock processing flags have been reset. Next posting will create fresh stock moves.",
            message_type='comment',
            subtype_xmlid='mail.mt_note'
        )

        _logger.info(f"Stock processing flags reset for bill {self.name} by user {self.env.user.name}")