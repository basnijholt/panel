"""
Renders Streamz Stream objects.
"""
from __future__ import absolute_import, division, unicode_literals

import sys

import param

from .base import ReplacementPane


class Streamz(ReplacementPane):

    always_watch = param.Boolean(default=False, doc="""
        Whether to watch even when not displayed.""")

    def __init__(self, object=None, **params):
        super(Streamz, self).__init__(object, **params)
        self._stream = None
        if self.always_watch:
            self._setup_stream()

    @param.depends('object', 'always_watch', watch=True)
    def _setup_stream(self):
        if self.object is None or (self.always_watch and self._stream):
            return
        elif self._stream:
            self._stream.destroy()
            self._stream = None
        if self._pane._models or self.always_watch:
            self._stream = self.object.latest().rate_limit(0.5).gather()
            self._stream.sink(self._update_pane)

    def _get_model(self, doc, root=None, parent=None, comm=None):
        model = super(Streamz, self)._get_model(doc, root, parent, comm)
        self._setup_stream()
        return model

    def _cleanup(self, root=None):
        super(Streamz, self)._cleanup(root)
        if not self._pane._models and self._stream:
            self._stream.destroy()
            self._stream = None

    #----------------------------------------------------------------
    # Public API
    #----------------------------------------------------------------

    @classmethod
    def applies(cls, obj):
        if 'streamz' in sys.modules:
            from streamz import Stream
            return isinstance(obj, Stream)
        return False