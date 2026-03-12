import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { productsAPI } from '../services/api';
import { FaPlus, FaEdit, FaTrash, FaCog, FaCopy, FaEllipsisV } from 'react-icons/fa';
import LoadingSpinner from '../components/LoadingSpinner';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const Products: React.FC = () => {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetchProducts();
  }, []);

  const sanitizeProduct = (product: any): any => {
    const sanitized = { ...product };
    if (sanitized._id && typeof sanitized._id !== 'string') sanitized._id = String(sanitized._id);
    if (Array.isArray(sanitized.categories)) {
      sanitized.categories = sanitized.categories.map((cat: any) => {
        if (typeof cat === 'string') return cat;
        if (cat && typeof cat === 'object' && cat._id) return { ...cat, _id: typeof cat._id === 'string' ? cat._id : String(cat._id) };
        return cat;
      });
    }
    if (Array.isArray(sanitized.images)) {
      sanitized.images = sanitized.images.map((img: any) => typeof img === 'string' ? img : null).filter(Boolean);
    }
    if (sanitized.price !== undefined) sanitized.price = Number(sanitized.price) || 0;
    if (sanitized.originalPrice !== undefined) sanitized.originalPrice = Number(sanitized.originalPrice) || 0;
    if (sanitized.name !== undefined) sanitized.name = String(sanitized.name || '');
    return sanitized;
  };

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const response = await productsAPI.getAll();
      let products: any[] = Array.isArray(response) ? response : (response?.data?.data || response?.data || []);
      setProducts(products.map(sanitizeProduct));
    } catch (error) {
      console.error('Failed to fetch products:', error);
      setProducts([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDuplicate = async (id: string) => {
    setDuplicatingId(id);
    try {
      const response = await productsAPI.duplicate(id);
      if (response?.data) {
        navigate('/products/new', { state: { prefilledData: response.data, duplicatedFrom: id } });
      } else {
        alert('Failed to load product data for duplication.');
      }
    } catch (error) {
      console.error('Failed to duplicate:', error);
      alert('Failed to duplicate product. Please try again.');
    } finally {
      setDuplicatingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this product?')) return;
    try {
      await productsAPI.delete(id);
      fetchProducts();
    } catch (error) {
      alert('Failed to delete product');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" color="primary" text="Loading products..." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold tracking-tight">Products</h1>
        <Button asChild className="bg-primary hover:bg-primary/90 text-primary-foreground">
          <Link to="/products/new">
            <FaPlus className="mr-2" /> Add Product
          </Link>
        </Button>
      </div>

      <div className="rounded-md border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>Categories</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center">
                  No products found.
                </TableCell>
              </TableRow>
            ) : (
              products.map((product) => (
                <TableRow key={product._id}>
                  <TableCell>
                    <div className="flex items-center gap-4">
                      {product.images?.[0] ? (
                        <div className="h-12 w-12 rounded-md overflow-hidden bg-muted flex-shrink-0">
                          <img
                            src={product.images[0]}
                            alt={product.name}
                            className="h-full w-full object-cover"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                        </div>
                      ) : (
                        <div className="h-12 w-12 rounded-md bg-muted flex items-center justify-center text-muted-foreground text-xs">No img</div>
                      )}
                      <div className="flex flex-col">
                        <span className="font-medium text-foreground">{product.name || 'Unnamed Product'}</span>
                        <span className="text-xs text-muted-foreground tracking-wider">ID: {product._id}</span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">₹{product.price.toLocaleString('en-IN')}</div>
                    {product.originalPrice > 0 && (
                      <div className="text-xs text-muted-foreground line-through">
                        ₹{product.originalPrice.toLocaleString('en-IN')}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {product.categories?.length ? (
                        product.categories.map((cat: any, i: number) => {
                          const name = cat?.name || cat?.slug || (typeof cat === 'string' ? cat : 'Category');
                          return (
                            <Badge variant="secondary" key={`${product._id}-cat-${i}`} className="text-xs font-normal">
                              {name}
                            </Badge>
                          );
                        })
                      ) : (
                        <span className="text-xs text-muted-foreground">Unassigned</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={product.isActive ? "default" : "destructive"} className={product.isActive ? "bg-green-500/15 text-green-700 hover:bg-green-500/25 border-green-200" : ""}>
                      {product.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                          <span className="sr-only">Open menu</span>
                          <FaEllipsisV className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        <DropdownMenuItem asChild>
                          <Link to={`/products/${product._id}/edit`} className="cursor-pointer">
                            <FaEdit className="mr-2 h-4 w-4" /> Edit
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link to={`/products/${product._id}/sections`} className="cursor-pointer">
                            <FaCog className="mr-2 h-4 w-4" /> Manage Sections
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem 
                          className="cursor-pointer" 
                          onClick={() => handleDuplicate(product._id)}
                          disabled={duplicatingId === product._id}
                        >
                          <FaCopy className="mr-2 h-4 w-4" /> 
                          {duplicatingId === product._id ? 'Duplicating...' : 'Duplicate'}
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          className="cursor-pointer text-destructive focus:text-destructive" 
                          onClick={() => handleDelete(product._id)}
                        >
                          <FaTrash className="mr-2 h-4 w-4" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default Products;
