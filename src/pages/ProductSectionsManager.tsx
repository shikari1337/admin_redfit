import React from 'react';
import { Navigate, useParams } from 'react-router-dom';

/**
 * RETIRED — the Sections Manager (page layout + per-section text) and the A+
 * Content panel were two editors for one product page. Both now live in the
 * Product Page Studio on the product form's "Page content" tab. This route is
 * kept so old links and bookmarks land in the right place.
 */
const ProductSectionsManager: React.FC = () => {
  const { id } = useParams();
  return <Navigate to={`/products/${encodeURIComponent(id || '')}/edit?tab=content`} replace />;
};

export default ProductSectionsManager;
