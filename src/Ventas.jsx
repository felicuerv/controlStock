// Componente Ventas.jsx adaptado completamente de Compras.jsx
// Se incluyen todas las funcionalidades: vistas, exportación Excel, selección múltiple, lógica de stock, estilos coherentes

import React, { useState, useEffect, useRef } from "react";
import {
  Box, Input, Button, Textarea, Heading, VStack, HStack, Grid,
  Text, useToast, Select, Drawer, DrawerBody, DrawerFooter,
  DrawerHeader, DrawerOverlay, DrawerContent, extendTheme, FormLabel, useDisclosure, DrawerCloseButton,
  Flex, IconButton, Tooltip, Checkbox, SimpleGrid, Spinner, Badge
} from "@chakra-ui/react";
import { AddIcon, ViewIcon, ViewOffIcon, DownloadIcon } from "@chakra-ui/icons";
import { motion, AnimatePresence } from "framer-motion";
import { db } from "./firebase";
import { collection, addDoc, getDocs, getDoc, updateDoc, doc, deleteDoc, query, where } from "firebase/firestore";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// Función para generar factura tipo B PDF
const generarFacturaPDF = (venta) => {
  const doc = new jsPDF();
  const fecha = new Date(venta.fecha).toLocaleDateString("es-AR");

  doc.setFontSize(12);
  doc.text("Factura B", 14, 15);
  doc.text("Empresa XYZ S.R.L.", 14, 25);
  doc.text("CUIT: 30-12345678-9", 14, 31);
  doc.text("Condición frente al IVA: Responsable Inscripto", 14, 37);
  doc.text("Dirección: Av. Siempre Viva 742, Córdoba", 14, 43);
  doc.text("Tel: 0351-1234567", 14, 49);

  doc.setFontSize(11);
  doc.text(`Fecha: ${fecha}`, 150, 25);
  doc.text(`Cliente: ${venta.clienteNombre}`, 150, 31);
  doc.text(`Forma de pago: ${venta.formaPago}`, 150, 37);
  doc.text(`Condición: ${venta.estado}`, 150, 43);

  autoTable(doc, {
    startY: 60,
    head: [["Producto", "Cantidad", "Precio Unitario", "Total"]],
    body: [
      [
        venta.producto,
        venta.cantidad,
        `$${venta.precioUnitario.toFixed(2)}`,
        `$${venta.total.toFixed(2)}`
      ]
    ],
    styles: { halign: "center" },
    headStyles: { fillColor: [100, 100, 100] }
  });

  doc.setFontSize(12);
  doc.text(`TOTAL: $${venta.total.toFixed(2)}`, 14, doc.lastAutoTable.finalY + 15);
  doc.save(`Factura_${venta.clienteNombre}_${fecha}.pdf`);
};

const Ventas = () => {
  const toast = useToast();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const ventasRef = collection(db, "ventas");

  const [ventas, setVentas] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [productos, setProductos] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [orden, setOrden] = useState("fechaDesc");
  const [vistaLista, setVistaLista] = useState(true);
  const [editandoId, setEditandoId] = useState(null);
  const [modoSeleccion, setModoSeleccion] = useState(false);
  const [ventasSeleccionadas, setVentasSeleccionadas] = useState([]);
  const [pagina, setPagina] = useState(1);
  const ventasPorPagina = 15;
  const [cargandoMasivo, setCargandoMasivo] = useState(false);
  const [eliminandoMasivo, setEliminandoMasivo] = useState(false);

  const [nuevaVenta, setNuevaVenta] = useState({
    clienteId: "",
    fecha: "",
    formaPago: "",
    estado: "Presupuesto",
    producto: "",
    cantidad: "",
    precioUnitario: "",
    total: ""
  });

  const obtenerVentas = async () => {
    const data = await getDocs(ventasRef);
    setVentas(data.docs.map((doc) => ({ ...doc.data(), id: doc.id })));
  };

  const obtenerClientes = async () => {
    const snap = await getDocs(collection(db, "clientes"));
    setClientes(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
  };

  const obtenerProductos = async () => {
    const snap = await getDocs(collection(db, "productos"));
    setProductos(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
  };

  useEffect(() => {
    obtenerVentas();
    obtenerClientes();
    obtenerProductos();
  }, []);

  const manejarCambio = (e) => {
    const { name, value } = e.target;
    const updated = { ...nuevaVenta, [name]: value };
    if (name === "cantidad" || name === "precioUnitario") {
      const cantidad = name === "cantidad" ? Number(value) : Number(nuevaVenta.cantidad);
      const precio = name === "precioUnitario" ? Number(value) : Number(nuevaVenta.precioUnitario);
      updated.total = cantidad * precio;
    }
    setNuevaVenta(updated);
  };

  const limpiarFormulario = () => {
    setNuevaVenta({
      clienteId: "",
      fecha: "",
      formaPago: "",
      estado: "Presupuesto",
      producto: "",
      cantidad: "",
      precioUnitario: "",
      total: ""
    });
    setEditandoId(null);
    onClose();
  };

  const manejarSubmit = async (e) => {
    e.preventDefault();
    const { clienteId, fecha, formaPago, estado, producto, cantidad, precioUnitario, total } = nuevaVenta;
    if (
        clienteId.trim() === "" ||
        fecha.trim() === "" ||
        formaPago.trim() === "" ||
        estado.trim() === "" ||
        producto.trim() === "" ||
        Number(cantidad) <= 0 ||
        Number(precioUnitario) <= 0 ||
        Number(total) <= 0
      ) {
        toast({ title: "Faltan campos", status: "warning" });
        return;
      }
      
    const cliente = clientes.find(c => c.id === clienteId);
    const productoQuery = query(collection(db, "productos"), where("nombre", "==", producto));
    const productoSnap = await getDocs(productoQuery);
    if (productoSnap.empty) {
      toast({ title: "Producto no encontrado", status: "error" });
      return;
    }
    const productoDoc = productoSnap.docs[0];
    const productoData = productoDoc.data();
    const nuevoStock = (productoData.stock || 0) - Number(cantidad);
    if (nuevoStock < 0) {
      toast({ title: "Stock insuficiente", status: "error" });
      return;
    }
    const ventaData = {
      clienteId: cliente?.id || "",
      clienteNombre: cliente?.nombre || "",
      fecha,
      formaPago,
      estado,
      producto,
      cantidad: Number(cantidad),
      precioUnitario: Number(precioUnitario),
      total: Number(total),
      fechaAlta: new Date().toISOString()
    };
    try {
      if (editandoId) {
        await updateDoc(doc(db, "ventas", editandoId), ventaData);
      } else {
        await addDoc(ventasRef, ventaData);
        await updateDoc(doc(db, "productos", productoDoc.id), { stock: nuevoStock });
      }
      toast({ title: "Venta guardada", status: "success" });
      limpiarFormulario();
      obtenerVentas();
      obtenerProductos();
    } catch (err) {
      toast({ title: "Error", description: err.message, status: "error" });
    }
  };

  const exportarAExcel = () => {
    const data = ventas.map((v) => ({
      Fecha: v.fecha,
      Cliente: v.clienteNombre,
      Producto: v.producto,
      Cantidad: v.cantidad,
      "Precio Unitario": v.precioUnitario,
      Total: v.total,
      "Forma de Pago": v.formaPago,
      Estado: v.estado
    }));
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Ventas");
    const excelBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    const blob = new Blob([excelBuffer], { type: "application/octet-stream" });
    saveAs(blob, `ventas_${new Date().toLocaleDateString()}.xlsx`);
  };

  const eliminarSeleccionados = async () => {
    setEliminandoMasivo(true);
    try {
      const eliminar = ventasSeleccionadas.map((id) => deleteDoc(doc(db, "ventas", id)));
      await Promise.all(eliminar);
      toast({ title: "Ventas eliminadas", status: "success" });
      obtenerVentas();
      setVentasSeleccionadas([]);
      setModoSeleccion(false);
    } catch (err) {
      toast({ title: "Error al eliminar", status: "error" });
    }
    setEliminandoMasivo(false);
  };
  const ventasFiltradas = ventas.filter((v) =>
    (v.producto || "").toLowerCase().includes(busqueda) ||
    (v.clienteNombre || "").toLowerCase().includes(busqueda)
  );
  
  const ventasOrdenadas = [...ventasFiltradas].sort((a, b) => {
    if (orden === "fechaDesc") return new Date(b.fecha) - new Date(a.fecha);
    if (orden === "cliente") return a.clienteNombre.localeCompare(b.clienteNombre);
    if (orden === "totalDesc") return b.total - a.total;
    return 0;
  });
  
  const ventasPaginadas = ventasOrdenadas.slice(0, pagina * ventasPorPagina);
  const hayMasVentas = ventasOrdenadas.length > ventasPaginadas.length;
  

  return (
    <Box minH="100vh" bg="gray.900" color="gray.100" px={4} py={6} pb="100px">
      <Flex justify="space-between" align="center" maxW="1000px" mx="auto" mb={4}>
        <Heading fontSize="2xl" color="teal.300">🧾 Ventas</Heading>
        <HStack spacing={2}>
          <Tooltip label={vistaLista ? "Vista tarjetas" : "Vista lista"}>
            <IconButton
              icon={vistaLista ? <ViewIcon /> : <ViewOffIcon />}
              onClick={() => setVistaLista(!vistaLista)}
              aria-label="Cambiar vista"
              colorScheme="teal"
            />
          </Tooltip>
          <Tooltip label="Agregar venta">
            <IconButton icon={<AddIcon />} onClick={onOpen} aria-label="Agregar venta" colorScheme="teal" />
          </Tooltip>
          <Tooltip label="Exportar a Excel">
            <IconButton icon={<DownloadIcon />} onClick={exportarAExcel} aria-label="Exportar" colorScheme="teal" />
          </Tooltip>
          <Tooltip label={modoSeleccion ? "Salir de selección" : "Seleccionar múltiples"}>
            <IconButton
              icon={<ViewIcon />}
              aria-label="Modo selección múltiple"
              onClick={() => {
                setModoSeleccion((prev) => !prev);
                setVentasSeleccionadas([]);
              }}
              colorScheme={modoSeleccion ? "yellow" : "red"}
            />
          </Tooltip>
        </HStack>
      </Flex>

      <Box maxW="1000px" mx="auto">
        <Input placeholder="Buscar por cliente o producto..." mb={4} value={busqueda} onChange={(e) => setBusqueda(e.target.value.toLowerCase())} />
        {modoSeleccion && (
          <HStack mb={4}>
            <Checkbox
              isChecked={ventasSeleccionadas.length === ventas.length}
              onChange={(e) => {
                if (e.target.checked) {
                  const todosIds = ventas.map((c) => c.id);
                  setVentasSeleccionadas(todosIds);
                } else {
                  setVentasSeleccionadas([]);
                }
              }}
            >
              Seleccionar todos
            </Checkbox>
            {ventasSeleccionadas.length > 0 && (
              <Button colorScheme="red" isLoading={eliminandoMasivo} onClick={eliminarSeleccionados}>
                Eliminar {ventasSeleccionadas.length} seleccionadas
              </Button>
            )}
          </HStack>
        )}
      </Box>
      {vistaLista ? (
  <VStack spacing={4} align="stretch" maxW="1000px" mx="auto">
    <AnimatePresence mode="wait">
      {ventasPaginadas.map((v) => (
        <motion.div
          key={v.id}
          initial={{ opacity: 0, y: 100 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 100 }}
          transition={{ type: "spring", stiffness: 260, damping: 20 }}
        >
          <Box p={4} bg="gray.800" borderRadius="md" shadow="md">
            <Heading size="md" mb={2}>{v.producto}</Heading>
            <Text>🧍 Cliente: {v.clienteNombre || "Sin cliente"}</Text>
            <Text>📅 Fecha: {v.fecha}</Text>
            <Text>💰 Total: ${v.total}</Text>
            <Badge mt={2} colorScheme="teal">{v.formaPago}</Badge>
            <Badge ml={2} colorScheme={v.estado === "Completada" ? "green" : v.estado === "En proceso" ? "yellow" : "gray"}>{v.estado}</Badge>
            <HStack mt={3}>
              <Button size="sm" colorScheme="blue" onClick={() => editarVenta(v)}>Editar</Button>
              <Button size="sm" colorScheme="red" onClick={() => solicitarEliminacion(v)}>Eliminar</Button>
              {v.estado === "Completada" && (
                <Button size="sm" colorScheme="teal" onClick={() => generarFacturaPDF(v)}>Imprimir Factura</Button>
              )}
            </HStack>
          </Box>
        </motion.div>
      ))}
    </AnimatePresence>
  </VStack>
) : (
  <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4} maxW="1000px" mx="auto">
    {ventasPaginadas.map((v) => (
      <motion.div
        key={v.id}
        initial={{ opacity: 0, y: 100 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 100 }}
        transition={{ type: "spring", stiffness: 260, damping: 20 }}
      >
        <Box p={4} bg="gray.800" borderRadius="md" shadow="md">
          <Heading size="lg" mb={1}>{v.producto}</Heading>
          <Text>🧍 Cliente: {v.clienteNombre || "Sin cliente"}</Text>
          <Text>📅 Fecha: {v.fecha}</Text>
          <Text>💰 Total: ${v.total}</Text>
          <Badge mt={2} colorScheme="teal">{v.formaPago}</Badge>
          <Badge ml={2} colorScheme={v.estado === "Completada" ? "green" : v.estado === "En proceso" ? "yellow" : "gray"}>{v.estado}</Badge>
          <HStack mt={3}>
            <Button size="sm" colorScheme="blue" onClick={() => editarVenta(v)}>Editar</Button>
            <Button size="sm" colorScheme="red" onClick={() => solicitarEliminacion(v)}>Eliminar</Button>
            {v.estado === "Completada" && (
              <Button size="sm" colorScheme="teal" onClick={() => generarFacturaPDF(v)}>Imprimir Factura</Button>
            )}
          </HStack>
        </Box>
      </motion.div>
    ))}
  </SimpleGrid>
)}
      <Drawer isOpen={isOpen} placement="right" onClose={onClose} size="md">
        <DrawerOverlay />
        <DrawerContent bg="gray.800" color="white">
          <DrawerCloseButton />
          <DrawerHeader borderBottomWidth="1px" borderColor="gray.600">
            {editandoId ? "✏️ Editar venta" : "➕ Agregar venta"}
          </DrawerHeader>
          <DrawerBody>
            <form id="formVenta" onSubmit={manejarSubmit}>
              <Grid templateColumns="1fr" gap={4}>
                <Select placeholder="Seleccionar cliente" name="clienteId" value={nuevaVenta.clienteId} onChange={manejarCambio} bg="gray.700" color="white">
                  {clientes.map((cli) => (
                    <option key={cli.id} value={cli.id} style={{ background: "#1A202C" }}>{cli.nombre}</option>
                  ))}
                </Select>
                <Input name="fecha" type="date" value={nuevaVenta.fecha} onChange={manejarCambio} bg="gray.700" borderColor="gray.600" />
                <Select name="formaPago" value={nuevaVenta.formaPago} onChange={manejarCambio} bg="gray.700" color="white">
                  <option value="efectivo" style={{ background: "#1A202C" }}>Efectivo</option>
                  <option value="tarjeta" style={{ background: "#1A202C" }}>Tarjeta</option>
                  <option value="transferencia" style={{ background: "#1A202C" }}>Transferencia</option>
                </Select>
                <Select name="estado" value={nuevaVenta.estado} onChange={manejarCambio} bg="gray.700" color="white">
                  <option value="Presupuesto" style={{ background: "#1A202C" }}>Presupuesto</option>
                  <option value="En proceso" style={{ background: "#1A202C" }}>En proceso</option>
                  <option value="Completada" style={{ background: "#1A202C" }}>Completada</option>
                </Select>
                <Select name="producto" value={nuevaVenta.producto} onChange={manejarCambio} bg="gray.700" color="white">
                  {productos.map((prod) => (
                    <option key={prod.id} value={prod.nombre} style={{ background: "#1A202C" }}>{prod.nombre}</option>
                  ))}
                </Select>
                <HStack>
                  <Input name="cantidad" type="number" placeholder="Cantidad" value={nuevaVenta.cantidad} onChange={manejarCambio} bg="gray.700" borderColor="gray.600" />
                  <Input name="precioUnitario" type="number" placeholder="Precio Unitario" value={nuevaVenta.precioUnitario} onChange={manejarCambio} bg="gray.700" borderColor="gray.600" />
                </HStack>
                <Input name="total" type="number" placeholder="Total" value={nuevaVenta.total} readOnly bg="gray.700" borderColor="gray.600" />
              </Grid>
            </form>
          </DrawerBody>
          <DrawerFooter borderTopWidth="1px" borderColor="gray.600">
            <Button variant="outline" mr={3} onClick={limpiarFormulario} bg="gray.700" color="white" _hover={{ bg: "gray.600" }}>Cancelar</Button>
            <Button colorScheme="teal" type="submit" form="formVenta">{editandoId ? "Guardar cambios" : "Agregar venta"}</Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </Box>
  );
};

export default Ventas;

