# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from . import models


def post_init_hook(env):
    """Post-installation hook to update existing product barcodes.

    This runs automatically when the module is installed or upgraded.

    Args:
        env: Odoo environment
    """
    import logging
    _logger = logging.getLogger(__name__)

    _logger.info("Starting automatic barcode migration for existing products...")

    try:
        # Get the product model and update existing barcodes
        ProductProduct = env['product.product']
        result = ProductProduct.update_existing_barcodes()

        _logger.info("Barcode migration completed successfully!")
        _logger.info("Updated: %s products", result['updated'])
        _logger.info("Skipped: %s products", result['skipped'])

        # Create a notification message for the user
        notification_message = (
            f"Custom Product Barcode module installed successfully!\n"
            f"Automatically updated {result['updated']} existing products with name-based barcodes.\n"
            f"Future products will automatically get barcodes based on their names."
        )

        # Log the notification (visible in the server logs)
        _logger.info(notification_message)

    except Exception as e:
        _logger.error("Error during barcode migration: %s", e)
        # Don't raise the exception to avoid installation failure
        # The module will still install, but barcodes won't be migrated
        _logger.warning("Module installed but barcode migration failed. You can run it manually later.")