from . import models
from . import report

# Add import hook to ensure templates load properly
from odoo.tools import config

# Log to console during initialization to verify loading
import logging
_logger = logging.getLogger(__name__)
_logger.info("POS Salesperson Tracking module loading...")