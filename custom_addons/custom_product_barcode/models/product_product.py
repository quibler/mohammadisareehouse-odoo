# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

import logging
import re
import time

from odoo import _, api, fields, models
from odoo.exceptions import UserError

_logger = logging.getLogger(__name__)


class ProductProduct(models.Model):
    _inherit = 'product.product'

    def _clean_name_for_barcode(self, name):
        """Clean product name to make it suitable for Code128 barcode.

        Args:
            name (str): Product name to clean

        Returns:
            str: Cleaned name suitable for Code128 barcode
        """
        if not name:
            return ""

        # Remove leading/trailing whitespace
        cleaned = name.strip()

        # Remove invalid characters for Code128 (keep only alphanumeric, dash, space, underscore, dot)
        cleaned = re.sub(r'[^A-Za-z0-9\-\s\._]', '', cleaned)

        # Replace spaces with underscores for better barcode readability
        cleaned = cleaned.replace(' ', '_')

        # Remove multiple consecutive underscores
        cleaned = re.sub(r'_+', '_', cleaned)

        # Convert to uppercase for consistency
        cleaned = cleaned.upper()

        # Truncate to 25 characters maximum
        if len(cleaned) > 25:
            cleaned = cleaned[:25]
            _logger.warning(
                "Product name truncated for barcode: original length %s, truncated to 25 chars",
                len(name)
            )

        return cleaned

    def _generate_fallback_barcode(self):
        """Generate fallback barcode when product name is empty or invalid.

        Returns:
            str: Fallback barcode in format PROD_{ID} or PROD_{timestamp}
        """
        # Use product ID with a readable prefix
        if hasattr(self, 'id') and self.id:
            return f"PROD_{self.id}"

        # For new products without ID yet, use timestamp-based fallback
        timestamp = str(int(time.time()))[-6:]  # Last 6 digits of timestamp
        return f"PROD_{timestamp}"

    def _ensure_unique_barcode(self, base_barcode):
        """Ensure barcode is unique by appending number if needed.

        Args:
            base_barcode (str): Base barcode to make unique

        Returns:
            str: Unique barcode
        """
        barcode = base_barcode
        counter = 1

        while True:
            # Check if barcode already exists (excluding current record if updating)
            domain = [('barcode', '=', barcode)]
            if hasattr(self, 'id') and self.id:
                domain.append(('id', '!=', self.id))

            # Skip uniqueness check if we're in bulk update mode
            if self.env.context.get('skip_barcode_uniqueness'):
                return barcode

            existing = self.search(domain)

            if not existing:
                return barcode

            counter += 1
            # Ensure the numbered version doesn't exceed 25 chars
            suffix = f"_{counter}"
            max_base_length = 25 - len(suffix)

            if len(base_barcode) > max_base_length:
                barcode = base_barcode[:max_base_length] + suffix
            else:
                barcode = base_barcode + suffix

    def _generate_barcode_from_name(self, name):
        """Generate barcode from product name.

        Args:
            name (str): Product name

        Returns:
            str: Generated unique barcode
        """
        cleaned_name = self._clean_name_for_barcode(name)

        if not cleaned_name:
            # Use fallback if name is empty or becomes empty after cleaning
            barcode = self._generate_fallback_barcode()
            _logger.info(
                "Using fallback barcode: %s (original name: '%s')",
                barcode, name
            )
        else:
            barcode = cleaned_name

        # Ensure uniqueness
        unique_barcode = self._ensure_unique_barcode(barcode)

        if unique_barcode != barcode:
            _logger.info("Barcode made unique: %s -> %s", barcode, unique_barcode)

        return unique_barcode

    @api.model_create_multi
    def create(self, vals_list):
        """Override create to auto-generate barcode from product name."""
        for vals in vals_list:
            # Check if barcode is not provided or is empty
            if 'barcode' not in vals or not vals.get('barcode'):
                # Get product name for barcode generation
                product_name = vals.get('name', '')

                # Generate barcode from name
                generated_barcode = self._generate_barcode_from_name(product_name)
                vals['barcode'] = generated_barcode

                _logger.info(
                    "Auto-generated barcode '%s' for product '%s'",
                    generated_barcode, product_name
                )

            # Validate provided barcode format for Code128
            elif vals.get('barcode'):
                barcode = vals['barcode'].strip()
                if barcode and not re.match(r'^[A-Za-z0-9\-\s\._]+$', barcode):
                    raise UserError(
                        _("Barcode '%s' contains invalid characters for Code128 format.") % barcode
                    )
                vals['barcode'] = barcode

        # Call the original create method
        return super().create(vals_list)

    def write(self, vals):
        """Override write to update barcode when name changes."""
        # If name is being updated and no barcode is explicitly set
        if 'name' in vals and 'barcode' not in vals:
            for product in self:
                # Always update barcode to match new name (overwrite existing)
                new_barcode = self._generate_barcode_from_name(vals['name'])
                current_barcode = product.barcode or ''

                # Only update if the new barcode would be different
                if current_barcode != new_barcode:
                    vals['barcode'] = new_barcode
                    _logger.info(
                        "Updated barcode for '%s': %s -> %s",
                        product.name, current_barcode, new_barcode
                    )
                break  # Only update one product at a time in batch updates

        return super().write(vals)

    @api.constrains('barcode')
    def _check_barcode_validity(self):
        """Ensure barcode is valid for Code128 format when set."""
        for product in self:
            if product.barcode:
                # Basic validation for Code128 - alphanumeric, dash, space, underscore, dot
                if not re.match(r'^[A-Za-z0-9\-\s\._]+$', product.barcode):
                    raise UserError(
                        _("Product '%s' has an invalid barcode format: %s") %
                        (product.name, product.barcode)
                    )

    @api.model
    def update_existing_barcodes(self):
        """Update ALL existing products to use name-based barcodes.

        This method overwrites existing barcodes if they don't match the product name.

        Returns:
            dict: Dictionary with 'updated' and 'skipped' counts
        """
        # Find ALL products
        all_products = self.search([])

        updated_count = 0
        skipped_count = 0

        for product in all_products:
            if not product.name:
                _logger.warning("Skipping product ID %s - no name available", product.id)
                skipped_count += 1
                continue

            old_barcode = product.barcode or ''
            expected_barcode = self._generate_barcode_from_name(product.name)

            # Only update if current barcode doesn't match expected name-based barcode
            if old_barcode != expected_barcode:
                try:
                    # Temporarily disable the constraint to avoid conflicts during bulk update
                    product.with_context(skip_barcode_uniqueness=True).write({
                        'barcode': expected_barcode
                    })
                    updated_count += 1
                    _logger.info(
                        "Updated product '%s': '%s' -> '%s'",
                        product.name, old_barcode, expected_barcode
                    )
                except Exception as e:
                    _logger.error(
                        "Failed to update barcode for product '%s': %s",
                        product.name, e
                    )
                    skipped_count += 1
            else:
                _logger.debug(
                    "Product '%s' already has correct barcode: '%s'",
                    product.name, old_barcode
                )

        _logger.info(
            "Barcode update completed. Updated %s products, skipped %s products.",
            updated_count, skipped_count
        )
        return {'updated': updated_count, 'skipped': skipped_count}

    # Ensure barcode uniqueness system-wide
    _sql_constraints = [
        ('barcode_uniq', 'unique(barcode)', 'A barcode can only be assigned to one product!')
    ]